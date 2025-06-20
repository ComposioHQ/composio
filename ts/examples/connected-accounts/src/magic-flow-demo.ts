import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const userId = 'default';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------------------------------------
// 1. Authorize the user to GitHub
// ------------------------------------------------------------

const connectionRequest = await composio.toolkits.authorize(userId, 'github');
// Redirect the user to continue to auth flow
const redirectUrl = connectionRequest.redirectUrl;

console.log(`Redirect the user to ${redirectUrl}`);

// Wait for the user to connect the account / singin to GitHub
const connectedAccount = await connectionRequest.waitForConnection();

// ------------------------------------------------------------
// 2. Get the GitHub tools
// ------------------------------------------------------------

const tools = await composio.tools.get(userId, {
  toolkits: ['github'],
});

// ------------------------------------------------------------
// 3. Use the Composio GitHub tools with OpenAI
// ------------------------------------------------------------
const task = 'Star the composio repository on GitHub';
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'system', content: 'You are a helpful assistant that can help with tasks.' },
  { role: 'user', content: task },
];

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: tools,
  tool_choice: 'auto',
});
