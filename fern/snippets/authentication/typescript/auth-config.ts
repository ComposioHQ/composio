import { Composio } from '@composio/core';

const composio = new Composio();

const authConfig = await composio.authConfigs.create('PERPLEXITYAI', {
  name: 'Perplexity AI',
  type: 'use_custom_auth',
  credentials: {},
  authScheme: 'API_KEY',
});

console.log(authConfig);
