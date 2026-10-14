// RF-02.4: Entry point de AWS Lambda detrás de API Gateway REST (proxy integration).
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleRequest } from './app.js';
import { DynamoStore } from './dynamo-store.js';

const store = new DynamoStore(process.env.TABLE_NAME ?? '');

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // El authorizer de Cognito valida el JWT antes de llegar aquí; su `sub` es el userId
  const claims = event.requestContext.authorizer?.claims as Record<string, string> | undefined;
  try {
    const res = await handleRequest(
      {
        method: event.httpMethod,
        path: event.path,
        body: event.body,
        userId: claims?.sub ?? 'guest',
      },
      store,
    );
    return { statusCode: res.statusCode, headers: CORS, body: JSON.stringify(res.body) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Error interno' }) };
  }
}
