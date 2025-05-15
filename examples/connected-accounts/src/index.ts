import { Composio } from '@composio/core';
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

const ConnectionRequest = await composio.createConnectedAccount('default', 'ac_rjfaMZTL4RzX', {});

console.log(ConnectionRequest);

const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(connectedAccount);

// const connectedAccount = await composio.connectedAccounts.get('ca_yAflyFVJs0p4');

// console.log(connectedAccount);
