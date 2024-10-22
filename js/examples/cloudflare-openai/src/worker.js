import { Hono } from 'hono';
import { OpenAIToolSet } from "composio-core";
import OpenAI from "openai";

const app = new Hono();

const setupUserConnection = async (toolset, entityId) => {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');
  if (!connection) {
    const newConnection = await entity.initiateConnection('github');
    console.log('Log in via: ', newConnection.redirectUrl);
    return { redirectUrl: newConnection.redirectUrl, message: 'Please log in to continue and then call this API again' };
  }
  return connection;
};

app.post('/', async (c) => {
  try {
    const openaiClient = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });
    const toolset = new OpenAIToolSet({ apiKey: c.env.COMPOSIO_API_KEY });

    const entity = await toolset.client.getEntity('default2');
    const connection = await setupUserConnection(toolset, entity.id);
    if (connection.redirectUrl) return c.json(connection);

    const tools = await toolset.getTools({ actions: ['github_issues_create'] }, entity.id);
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant that creates GitHub issues." },
        { role: "user", content: "Create an issue with the title 'Sample Issue' in the repo anonthedev/break. Use only the provided tools." }
      ],
      tools,
      tool_choice: "auto",
    });

    const result = await toolset.handleToolCall(response, entity.id);
    return c.json({ message: "Issue has been created successfully", result });
  } catch (err) {
    console.error('Error:', err);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
});

export default app;
