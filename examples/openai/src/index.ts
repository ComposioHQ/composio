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

// composio.useBeforeToolExecute('HACKERNEWS_GET_USER', params => {
//   if (params.arguments) {
//     // Modify the arguments before executing the tool
//     params.arguments = {
//       ...params.arguments,
//       username: 'haxzie',
//     };
//   }
//   return params;
// });

// composio.useBeforeToolExecute((toolSlug, params) => {
//   switch (toolSlug) {
//     case 'HACKERNEWS_GET_USER':
//       if (params.arguments) {
//         // Modify the arguments before executing the tool
//         params.arguments = {
//           ...params.arguments,
//           username: 'haxzie',
//         };
//       }
//       break;
//     default:
//       break;
//   }
//   return params;
// });

const connectionRequest = await composio.createConnectedAccount('test-user-id', 'HACKERNEWS', {
  // i know this is the connection data but any reason the user needs access to this like this?
  data: {},
});

const connectedAccount = await connectionRequest.waitForConnection();

// Fetch all the tools from the Composio API
// these tools are automatically typed and wrapped with the OpenAI Toolset
const tool = await composio.getToolBySlug('test-user-id', 'HACKERNEWS_GET_USER', {
  modifyToolSchema: (toolSlug, toolSchema) => {
    return toolSchema;
  },
});

const task = "Fetch the details of the user 'haxzie'";

const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'system', content: 'You are a helpful assistant that can help with tasks.' },
  { role: 'user', content: task },
];

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: [tool],
  tool_choice: 'auto',
});

if (response.choices[0].message.tool_calls) {
  try {
    const result = await composio.toolset.executeToolCall(
      'test-user-id',
      response.choices[0].message.tool_calls[0],
      // should be optional options
      {
        // hmm ig we can have this and call this like overwriteConnectedAccountId
        connectedAccountId: '',
        // what is his for here?
        customAuthParams: {},
      },
      {
        // hmm i wonder about options then modifiers like this
        // toolkit slug too
        afterToolExecute: (toolSlug, result) => {
          // hmm i wonder about this
        },
        // here we should give a subset of params like userId should not be mutable here
        beforeToolExecute: (toolSlug, params) => {},
      }
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify(error, null, 2));
  }
}
