import { experimental_createMCPClient as createMCPClient } from 'ai';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Use the MCP server URL you generated
const mcpServerUrl = "https://backend.composio.dev/v3/mcp/YOUR_SERVER_ID?include_composio_helper_actions=true&user_id=YOUR_USER_ID";

// Create MCP client
const mcpClient = await createMCPClient({
  name: 'composio-mcp-client',
  transport: new SSEClientTransport(new URL(mcpServerUrl)),
});

// Get available tools from the MCP server
const tools = await mcpClient.tools();

// Use with Vercel AI SDK
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: tools,
  prompt: 'Send an email to john@example.com with meeting notes',
});

console.log(result.text);