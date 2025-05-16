import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Initialize Composio
 * OpenAI Toolset is automatically installed and initialized
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Get the tool by slug
 * This tool is automatically typed and wrapped with the OpenAI Toolset
 */
const tool = await composio.getToolBySlug('default', 'HACKERNEWS_GET_USER');
/**
 * Define a task for the assistant based on the tools in hand
 */
const task = "Fetch the details of the user 'haxzie'";

/**
 * Define the messages for the assistant
 */
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'system', content: 'You are a helpful assistant that can help with tasks.' },
  { role: 'user', content: task },
];

/**
 * Create a chat completion
 */
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: [tool],
  tool_choice: 'auto',
});

/**
 * If the assistant has tool calls, execute them and log the result
 */
if (response.choices[0].message.tool_calls) {
  console.log(`✅ Calling tool ${response.choices[0].message.tool_calls[0].function.name}`);
  const result = await composio.toolset.handleToolCall('default', response);
  const data = JSON.parse(result[0]);
  console.log(data);
}
