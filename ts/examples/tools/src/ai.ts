import { Composio } from '@composio/core';
import { OpenAI } from 'openai';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Initialize Composio
 * OpenAI Provider is automatically installed and initialized
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // Local file paths under fileUploadDirs are uploaded automatically when the tool expects a file
  dangerouslyAllowAutoUploadDownloadFiles: true,
  fileUploadDirs: [import.meta.dirname],
});

const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // a user with a Google Drive connection
if (!userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

/**
 * Get the tools
 * This tool is automatically typed and wrapped with the OpenAI Provider
 */
console.log('🔄 Getting tools...');
const tools = await composio.tools.get(userId, 'GOOGLEDRIVE_UPLOAD_FILE');
console.log('✅ Tools fetched successfully...');
console.log(JSON.stringify(tools, null, 2));
/**
 * Define a task for the assistant based on the tools in hand
 */
const fileToUpload = path.join(import.meta.dirname, 'image.png');
const task = `Upload the file ${fileToUpload} to Google Drive`;

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
console.log('🔄 Creating chat completion...');
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: tools,
  tool_choice: 'auto',
});
console.log('✅ Chat completion created successfully...');
/**
 * If the assistant has tool calls, execute them and log the result
 */
console.log('🔄 Calling tool...');
if (
  response.choices[0].message.tool_calls &&
  response.choices[0].message.tool_calls[0].type === 'function'
) {
  console.log(`✅ Calling tool ${response.choices[0].message.tool_calls[0].function.name}`);
  const result = await composio.provider.handleToolCalls(userId, response);
  console.log(result);
}
console.log('✅ Tool called successfully...');
