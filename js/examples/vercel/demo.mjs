import { openai } from "@ai-sdk/openai";
import { VercelAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
dotenv.config();

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const appName = "googlesheets";

async function setupUserConnectionIfNotExists(entityId) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection(appName);

  if (!connection) {
    // Initiate a new connection if it doesn't exist
    const newConnection = await entity.initiateConnection(appName);
    console.log("Log in via: ", newConnection.redirectUrl);
    return newConnection.waitUntilActive(60);
  }

  return connection;
}

async function executeAgent(entityName) {
  // Setup entity and ensure connection
  const entity = await toolset.client.getEntity(entityName);
  await setupUserConnectionIfNotExists(entity.id);

  // Retrieve tools for the specified app
  const tools = await toolset.get_tools({ apps: [appName] }, entity.id);
  
  // Generate text using the model and tools
  const output = await generateText({
    model: openai("gpt-4-turbo"),
    streamText: false,
    tools: tools,
    prompt: 'Create a google sheet titled "Leads" and populate it with 5 random entries containing first name, last name, and email.', 
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default_user");