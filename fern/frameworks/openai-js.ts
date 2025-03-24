import { OpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";

const toolset = new OpenAIToolSet({});

const appName = 'github';

async function setupUserConnectionIfNotExists(entityId) {
  const entity = toolset.client.getEntity(entityId);
  let connection;

  try {
    connection = await entity.getConnection({ appName: appName });
    return connection;
  } catch (error) {
    // Connection doesn't exist, create a new one
    console.log("No existing connection found, creating a new one...");
    connection = await entity.initiateConnection({appName: appName});
    console.log("Log in via: ", connection.redirectUrl);
    return connection.waitUntilActive(60);
  }
}

async function executeAgent(repo, entityName="default") {
    const entity = toolset.client.getEntity(entityName);
    
    try {
      const connection = await setupUserConnectionIfNotExists(entity.id);
      console.log("[!] Connection: ", connection);
    
      const tools = await toolset.getTools({ actions: ["github_issues_create"] }, entity.id);
      const instruction = `Make an issue with sample title in the repo - ${repo}`
      
      // Add an API key to the OpenAI client
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY // Make sure to set this environment variable
      });
      
      const response = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [{
              role: "user",
              content: instruction,
          }],
          tools: tools,
          tool_choice: "auto",
      });
    
      console.log(response.choices[0].message.tool_calls);
      await toolset.handleToolCall(response, entity.id);
    } catch (error) {
      console.error("Error executing agent:", error);
    }
}

executeAgent("himanshu-dixit/custom-repo-breaking");

