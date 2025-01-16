import { openai } from "../utils.mjs"; // Comment this to use the default openai 
// import { openai } from "@ai-sdk/openai"; // Uncomment this to use the default openai 
import { VercelAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
dotenv.config();

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const appName = "reddit";

async function setupUserConnectionIfNotExists(entityId) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection({
    app: appName,
  });
  if (!connection) {
    // Initiate a new connection if it doesn't exist
    const newConnection = await entity.initiateConnection({
      appName: appName,
    });
    console.log("Log in via: ", newConnection.redirectUrl);
    return newConnection.waitUntilActive(100);
  }

  return connection;
}

async function executeAgent(entityName) {
  // Setup entity and ensure connection
  const entity = await toolset.client.getEntity(entityName);
  //await setupUserConnectionIfNotExists(entity.id);

  // Retrieve tools for the specified app
  const tools = await toolset.getTools({ apps: [appName] }, entity.id);
  const subreddit = "r/developersIndia/";
  // Generate text using the model and tools
  const output = await generateText({
    model: openai("gpt-4o"), //groq("llama3-8b-8192"),
    streamText: false,
    tools: tools,
    prompt: `Research the subreddit ${subreddit} and provide a summary of the top posts.`,
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default");
