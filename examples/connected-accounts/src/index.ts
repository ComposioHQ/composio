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

// i think this should be a discriminated union, like only tools or toolkits or search can be there, inside the filter
// the other ones should be third object {} options
const tools = await composio.tools.get('user123', {
  tools: ['HACKERNEWS_GET_USER'],
  cursor: '123',
  important: '', // what is this doing do we need it can we remove it?
  limit: '10',
  toolkits: ['HACKERNEWS'],
});

/**
 * Create a new auth config
 */
const authConfig = await composio.createAuthConfig('my-toolkit', {
  type: AuthConfigTypes.CUSTOM,
  authScheme: AuthSchemeTypes.BASIC,
  credentials: {
    // this should error not like the credentials should come from the auth scheme type
    apiKey: '1234567890',
  },
});

/**
 * Create a new connected account
 */
// hmm so the createConnectedAccount here doesn't feel like i am initiating a connection request -> that is probably why it was called initiateConnection
// connectedAccounts.initiate or initialize work
const ConnectionRequest = await composio.initiateConnection('default', authConfig.id);
const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(connectedAccount);
