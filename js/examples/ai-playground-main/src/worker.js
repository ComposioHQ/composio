import { Hono } from 'hono';
import { CloudflareToolSet } from "composio-core";

const app = new Hono();

// Configuration for the AI model
const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};

// Function to set up the GitHub connection for the user if it doesn't exist
async function setupUserConnection(toolset, entityId) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');

  if (!connection) {
    const newConnection = await entity.initiateConnection('github');
    return { redirectUrl: newConnection.redirectUrl, message: 'Please log in to continue and then call this API again' };
  }

  return connection;
}

// POST endpoint to handle the AI request
app.post('/', async (c) => {
  const toolset = new CloudflareToolSet({
    apiKey: c.env.COMPOSIO_API_KEY,
  });

  
    const entity = await toolset.client.getEntity('default');
    //const connectionResult = await setupUserConnection(toolset, entity.id);
    
    //if (connectionResult.redirectUrl) {
    //  return c.json(connectionResult);
    //}

    const tools = await toolset.getTools({ actions: ['github_issues_create'] }, entity.id);
    const instruction = 'Create an issue with the title "Sample Issue" in the repo anonthedev/break. Use only the provided tools.';

    const messages = [
      { role: 'system', content: 'You are a helpful assistant that creates GitHub issues.' },
      { role: 'user', content: instruction },
    ];

    const toolCallResp = await c.env.AI.run(config.model, {
      messages,
      tools,
    });

    await toolset.handleToolCall(toolCallResp, entity.id);
    return c.json({ message: "Issue has been created successfully" });

});

export default app;
