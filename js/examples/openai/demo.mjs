import { OpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";

const toolset = new OpenAIToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
  });
  
  async function setupUserConnectionIfNotExists(entityId) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection('github');
  
    if (!connection) {
        // If this entity/user hasn't already connected the account
        const connection = await entity.initiateConnection(appName);
        console.log("Log in via: ", connection.redirectUrl);
        return connection.waitUntilActive(60);
    }
  
    return connection;
  }

  async function executeAgent(entityName) {
    const entity = await toolset.client.getEntity(entityName)
    await setupUserConnectionIfNotExists(entity.id);
  
    const tools = await toolset.get_actions({ actions: ["github_issues_create"] }, entity.id);
    const instruction = "Make an issue with sample title in the repo - himanshu-dixit/custom-repo-breaking"
  
    const client = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY })
    const response = await client.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{
            role: "user",
            content: instruction,
        }],
        tools: tools,
        tool_choice: "auto",
    })
  
    console.log(response.choices[0].message.tool_calls);
    await toolset.handle_tool_call(response, entity.id);
  }
  
  executeAgent("default")