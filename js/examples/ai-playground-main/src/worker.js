import { Hono } from 'hono';
import { CloudflareToolSet } from "composio-core"
const app = new Hono();

// Configuration for the AI model
const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};


// Function to set up the GitHub connection for the user if it doesn't exist
async function setupUserConnectionIfNotExists(toolset, entityId, c) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');

  if (!connection) {
    // If the user hasn't connected their GitHub account
    const connection = await entity.initiateConnection('github');
    console.log('Log in via: ', connection.redirectUrl);
    c.json({ redirectUrl: connection.redirectUrl, message: 'Please log in to continue and then call this API again' });
  }

  return connection;
}


// POST endpoint to handle the AI request
app.post('/', async (c) => {
  // Initialize the CloudflareToolSet with the API key
  const toolset = new CloudflareToolSet({
    apiKey: c.env.COMPOSIO_API_KEY,
  });

  try {
    const entity = await toolset.client.getEntity('default');
    await setupUserConnectionIfNotExists(toolset, entity.id, c);
    // Get the required tools for the AI task
    const tools = await toolset.get_actions({ actions: ['github_issues_create'] }, entity.id);
    const instruction = 'Make an issue with sample title in the repo - anonthedev/break, only use the tools';

    // Set up the initial messages for the AI model
    let messages = [
      { role: 'system', content: '' },
      { role: 'user', content: instruction },
    ];

    // Run the AI model with the messages and tools
    const toolCallResp = await c.env.AI.run(config.model, {
      messages,
      tools,
    });

    // Handle the tool call response
    await toolset.handle_tool_call(toolCallResp, entity.id);
    return c.json({ messages: "Your issue has been created" });
  } catch (err) {
    console.log(err);
    return c.text('Something went wrong', 500);
  }
});

export default app;
