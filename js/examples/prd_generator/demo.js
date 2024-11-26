import 'dotenv/config';
import { Langbase } from 'langbase';
import {OpenAIToolSet} from 'composio-core';

// Initialize Langbase with API key from environment variables
const langbase = new Langbase({
    apiKey: process.env.LANGBASE_API_KEY,
});

const GOOGLEDOCS_CREATE_DOCUMENT = async ({ title, text }) => {
	const toolset = new OpenAIToolSet({
        apiKey: process.env.COMPOSIO_API_KEY,
		entityId: "default_user",
    });
	const response = await toolset.client.getEntity("default_user").execute(
		'GOOGLEDOCS_CREATE_DOCUMENT',
		{
			title,
			text
		}
	);
	return response;
};

// Register the tools
const tools = {
    GOOGLEDOCS_CREATE_DOCUMENT,
};

(async () => {
	const messages = [
		{
			role: 'user',
			content: 'Write a prd for a docker like platform on google docs'
		}
	];

	// replace this with your Pipe API key
	const pipeApiKey = ``;

	const res = await fetch('https://api.langbase.com/v1/pipes/run', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${process.env.LANGBASE_API_KEY}`
		},
		body: JSON.stringify({
			messages
		})
	});
	const data = await res.json();
	console.log('Response:', data);
	// get the threadId from the response headers
	const threadId = await res.headers.get('lb-thread-id');

	const { raw } = data;

	// get the response message from the model
	const responseMessage = raw.choices[0].message;

	// get the tool calls from the response message
	const toolCalls = responseMessage.tool_calls;

	if (toolCalls) {
		const toolMessages = [];

		// call all the functions in the tool_calls array
		toolCalls.forEach(toolCall => {
			const toolName = toolCall.function.name;
			console.log('Tool Call:', toolCall);
			console.log('Raw arguments:', toolCall.function.arguments);
			try {
				const toolParameters = JSON.parse(toolCall.function.arguments);
				const toolFunction = tools[toolName];
				const toolResponse = toolFunction(toolParameters);

				toolMessages.push({
					tool_call_id: toolCall.id,
					role: 'tool',
					name: toolName,
					content: JSON.stringify(toolResponse),
				});
			} catch (error) {
				console.error('Error parsing JSON arguments:', error);
				console.error('Position:', error.message.match(/position (\d+)/)?.[1]);
				if (error.message.includes('position')) {
					const pos = parseInt(error.message.match(/position (\d+)/)[1]);
					console.error('Problematic section:', 
						JSON.stringify(toolCall.function.arguments.slice(Math.max(0, pos - 50), pos + 50))
					);
				}
			}
		});

		// send the tool responses back to the API
		const res = await fetch('https://api.langbase.com/v1/pipes/run', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.LANGBASE_API_KEY}`,
			},
			body: JSON.stringify({
				messages: toolMessages,
				threadId,
			}),
		});

		const data = await res.json();
		console.log('Tool responses processed successfully:', data);
	}
})();
