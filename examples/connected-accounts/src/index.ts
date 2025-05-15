import { AuthConfigTypes, AuthSchemeTypes, Composio } from '@composio/core';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Composio
// OpenAI Toolset is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await composio.tools.get('user123', {
  tools: ['HACKERNEWS_GET_USER'],
});

/**
 * Create a new auth config
 */
const authConfig = await composio.createAuthConfig('my-toolkit', {
  type: AuthConfigTypes.CUSTOM,
  authScheme: AuthSchemeTypes.API_KEY,
  credentials: {
    apiKey: '1234567890',
  },
});

/**
 * Create a new connected account
 */
const ConnectionRequest = await composio.createConnectedAccount('default', authConfig.id);
const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(connectedAccount);
