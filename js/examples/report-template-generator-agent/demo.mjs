import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
import { VercelAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
dotenv.config();

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const appName = "googledocs";

async function setupUserConnectionIfNotExists(entityId) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection({app:appName});

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
  const tools = await toolset.getTools({ actions: ["GOOGLEDOCS_CREATE_DOCUMENT"] }, entity.id);
  const topic = "The impact of AI on the future of work";
  // Generate text using the model and tools
  const output = await generateText({
    model: openai("gpt-4-turbo"),//groq("llama3-8b-8192"),
    streamText: false,
    tools: tools,
    prompt: `Generate a detailed long form report on the following topic: ${topic} and write in a google doc`, 
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default_user");