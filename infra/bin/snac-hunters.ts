// Entry point de CDK. Uso: pnpm --filter @snac-hunters/infra synth -c stage=dev
import { App } from 'aws-cdk-lib';
import { SnacHuntersStack } from '../lib/snac-hunters-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') === 'prod' ? 'prod' : 'dev';

new SnacHuntersStack(app, `SnacHunters-${stage}`, {
  stage,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  tags: { project: 'snac-hunters', team: 'equipo-13', stage },
});
