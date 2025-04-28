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

// Fetch all the tools from the Composio API
// these tools are automatically typed and wrapped with the OpenAI Toolset
const tool = await composio.getTool('HACKERNEWS_GET_USER');

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
      response.choices[0].message.tool_calls[0]
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify(error, null, 2));
  }
}
