import { Composio } from '@composio/core';
import { Hono } from 'hono';
import OpenAI from 'openai';

const app = new Hono();

const composio = new Composio({
	apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Fetch the tools from the Composio API
 */
app.get('/tools', async (c) => {
	const tools = await composio.tools.get('default', {
		toolkits: ['hackernews'],
	});
	return c.json(tools);
});

/**
 * Executing a tool request to fetch user details from the hackernews toolkit
 * This is a simple example of how to execute a tool request
 *
 * @example
 * ```curl
 * curl -X POST 'http://localhost:8787/user' \
 * --header 'Content-Type: application/json' \
 * --data-raw '{
 * "user": "pg"
 * }'
 * ```
 */
app.post('/user', async (c) => {
	const composio = new Composio({
		apiKey: process.env.COMPOSIO_API_KEY,
	});

	const { user } = await c.req.json();
	const userDetails = await composio.tools.execute('HACKERNEWS_GET_USER', {
		arguments: {
			username: user,
		},
		userId: 'default',
	});
	return c.json(userDetails.data);
});

/**
 * File upload example using the composio api using external link.
 *
 * Connect your google drive to the composio account before running this example.
 *
 * @example
 * ```curl
 * curl -X POST 'http://localhost:8787/upload-url' \
 * --header 'Content-Type: application/json' \
 * --data-raw '{
 * "fileUrl": "https://github.com/composiohq.png"
 * }'
 * ```
 */
app.post('/upload-url', async (c) => {
	const { fileUrl } = await c.req.json();
	const fileDetails = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
		arguments: {
			file_to_upload: fileUrl,
		},
		userId: 'default',
	});
	return c.json(fileDetails);
});

/**
 * File upload example using the composio api using file upload.
 *
 * @example
 * ```curl
 * curl -X POST 'http://localhost:8787/upload-file' \
 * --header 'Content-Type: multipart/form-data' \
 * --form 'file=./path/to/file'
 * ```
 */
app.post('/upload-file', async (c) => {
	// get the blob from the request
	const body = await c.req.parseBody();
	const file = body.file;
	const fileDetails = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
		arguments: {
			file_to_upload: file,
		},
		userId: 'default',
	});
	return c.json(fileDetails);
});

/**
 * File download example using the composio api using file download.
 * Pass your google drive file id to the composio api to download the file.
 *
 * @example
 * ```curl
 * curl -X POST 'http://localhost:8787/download-file' \
 * --header 'Content-Type: application/json' \
 * --data-raw '{
 * "fileId": "1234567890"
 * }'
 * ```
 */
app.post('/download-file', async (c) => {
	const { fileId } = await c.req.json();
	const fileDetails = await composio.tools.execute('GOOGLEDRIVE_DOWNLOAD_FILE', {
		arguments: {
			file_id: fileId,
		},
		userId: 'default',
	});
	return c.json(fileDetails);
});

app.post('/hackernews-chat', async (c) => {
	const { message } = await c.req.json();

	const openai = new OpenAI();

	const tools = await composio.tools.get('default', {
		toolkits: ['hackernews'],
	});

	const messages: OpenAI.ChatCompletionMessageParam[] = [
		{ role: 'system', content: 'You are a helpful assistant that can use tools to answer questions.' },
		{ role: 'user', content: message },
	];

	const response = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [{ role: 'user', content: message }],
		tools,
	});

	// push the assistant message to the messages array
	messages.push(response.choices[0].message);

	// handle the tool calls
	const toolResponses = await composio.provider.handleToolCalls('default', response);

	// push the tool responses to the messages array
	messages.push(...toolResponses);

	if (toolResponses.length > 0) {
		// create the final response
		const finalResponse = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages,
		});

		return c.json(finalResponse.choices);
	} else {
		return c.json(response.choices);
	}
});

export default app;
