import { Hono } from 'hono';
import { CloudflareToolSet } from "composio-core"
import { Apps } from 'composio-core/lib/src/sdk/models/apps';

const app = new Hono();

// Configuration for the AI model
const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};

async function setupUserConnectionIfNotExists(toolset, entityId, c) {
  const entity = toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');

  if (!connection) {
      // If the user hasn't connected their GitHub account
      const connection = await entity.initiateConnection('github');
      console.log('Log in via: ', connection.redirectUrl);
      c.json({ redirectUrl: connection.redirectUrl, message: 'Please log in to continue and then call this API again' });
  }

  return connection;
}
app.post('/', async (c) => {
    // Initialize the CloudflareToolSet with the API key
    const toolset = new CloudflareToolSet({
        apiKey: c.env.COMPOSIO_API_KEY,
    });
  
    try {
        const entity = toolset.client.getEntity('default');
        await setupUserConnectionIfNotExists(toolset, entity.id, c);
        // Get the required tools for the AI task
        const tools = await toolset.getTools({ apps: ['firecrawl','browserbase_tool','firecrawl'] }, entity.id);
        const instruction = 'Make an issue with sample title in the repo - anonthedev/break, only use the tools';
  
        // Set up the initial messages for the AI model
        let messages = [
            { role: 'system', content: `
                Take a screenshot of the website using Browserbase and save it as website1.png at the path:js/examples/webroaster/webroaster_cloudflare
                Analyze the image js/examples/webroaster/webroaster_cloudflare/website1.png:
                1. Describe the website you see.
                2. Analyze the website text after scraping.
                3. Roast the website based on the image and text analysis. Be creative and very funny.
            
                Media path: [js/examples/webroaster/webroaster_cloudflare/website1.png]` },
            { role: 'user', content: instruction },
        ];
  
        // Run the AI model with the messages and tools
        const toolCallResp = await c.env.AI.run(config.model, {
            messages,
            tools,
        });
  
        // Handle the tool call response
        await toolset.handleToolCall(toolCallResp, entity.id);
        return c.json({ messages: "The Website has been roasted" });
    } catch (err) {
        console.log(err);
        return c.text('Something went wrong', 500);
    }
  });
  