// RF-02.5: Infraestructura 100% AWS como código (us-east-1, stages dev/prod).
//
//  CloudFront ──> S3 (SPA React)
//      │
//  API Gateway REST ──(Cognito authorizer)──> Lambda (Node 22, mismo engine) ──> DynamoDB
//
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface SnacHuntersStackProps extends StackProps {
  readonly stage: 'dev' | 'prod';
}

export class SnacHuntersStack extends Stack {
  constructor(scope: Construct, id: string, props: SnacHuntersStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';
    const removalPolicy = isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    // --- Datos: partidas validadas y eventos de analítica (single-table) ---
    const table = new dynamodb.Table(this, 'GameTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    // --- Auth: Cognito User Pool ---
    const userPool = new cognito.UserPool(this, 'Players', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 8, requireSymbols: false },
      removalPolicy,
    });
    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      generateSecret: false,
    });

    // --- Cómputo: Lambda con el mismo engine que el cliente ---
    const apiFn = new NodejsFunction(this, 'ApiFunction', {
      entry: path.join(ROOT, 'apps/api/src/lambda.ts'),
      handler: 'handler',
      projectRoot: ROOT,
      depsLockFilePath: path.join(ROOT, 'pnpm-lock.yaml'),
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName, STAGE: props.stage },
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy,
      }),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        // El SDK v3 ya viene en el runtime de Lambda
        externalModules: ['@aws-sdk/*'],
        banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
      },
    });
    table.grantReadWriteData(apiFn);

    // --- API Gateway REST + Cognito authorizer ---
    const api = new apigw.RestApi(this, 'Api', {
      restApiName: `snac-hunters-${props.stage}`,
      deployOptions: { stageName: props.stage, throttlingRateLimit: 20, throttlingBurstLimit: 40 },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });
    const integration = new apigw.LambdaIntegration(apiFn);
    const authed = { authorizer, authorizationType: apigw.AuthorizationType.COGNITO };

    api.root.addResource('health').addMethod('GET', integration);
    api.root.addResource('runs').addMethod('POST', integration, authed);
    api.root.addResource('events').addMethod('POST', integration, authed);
    api.root.addResource('stats').addMethod('GET', integration, authed);

    // --- Hosting: S3 privado + CloudFront (OAC) ---
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: !isProd,
    });
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      // SPA: cualquier ruta desconocida sirve index.html
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const webDist = path.join(ROOT, 'apps/web/dist');
    if (existsSync(webDist)) {
      new s3deploy.BucketDeployment(this, 'DeployWeb', {
        sources: [s3deploy.Source.asset(webDist)],
        destinationBucket: siteBucket,
        distribution,
      });
    }

    new CfnOutput(this, 'ApiUrl', { value: api.url });
    new CfnOutput(this, 'WebUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
