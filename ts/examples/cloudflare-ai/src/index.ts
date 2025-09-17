import { create as createComposio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';
import { experimental_createMCPClient as createMCPClient, generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { env, waitUntil } from 'cloudflare:workers';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export default {
	async fetch(request): Promise<Response> {
		if (request.method !== 'GET') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		const composio = createComposio({
			apiKey: env.COMPOSIO_API_KEY,
			provider: new CloudflareProvider(),
			experimental: {
				mcp: true,
			},
		});
		console.log('Composio initialized');
		
		const workersai = createWorkersAI({ binding: env.AI });
		console.log('WorkersAI initialized');

		const connectedAccountId = env.COMPOSIO_CONNECTED_ACCOUNT_ID;
		const allowedTools = ['GMAIL_FETCH_EMAILS'];

		// Retrieve an MCP config
		const mcpConfig = await composio.mcpConfig.getByName('gmail-mcp-1758110848786');
		console.log('MCP config retrieved');

		// Retrieve the MCP server instance for the connected accounts
		const url = await composio.mcp.experimental.getServer(mcpConfig.id, connectedAccountId, {
			limitTools: allowedTools,
		});
		console.log('MCP server URL retrieved:', url.toString());

		const serverParams = new SSEClientTransport(url);

		// Create an MCP client.
		const mcpClient = await createMCPClient({
			name: 'composio-mcp-client',
			transport: serverParams,
		});
		console.log('MCP client created');

		// Retrieve tools.
		const tools = await mcpClient.tools();
		console.log(`✅ Tools available: ${Object.keys(tools)}\n`);

		// Run a model with the tools
		const result = await generateText({
      model: workersai('@cf/meta/llama-3.2-3b-instruct'),
			system: `
				You are a helpful Gmail assistant that fetches and summarizes emails.
				When fetching emails, provide a clear summary of the results including sender, subject, and date.
				Be concise and provide actionable information based on the email content.
			`,
			prompt: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email`,
			tools,
			toolChoice: 'required', // force the model to use tools
    });
		console.log('Result generated');

		// `waitUntil` extends the lifetime of your Worker, allowing you to perform work without blocking returning a response
		// and that may continue after a response is returned.
		// See: https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil.
		waitUntil(mcpClient.close())

		console.log('Returning response');
		return Response.json({ data: result.content });
	},
} satisfies ExportedHandler<Env>;
