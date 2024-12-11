import { groq } from "@ai-sdk/groq";
import { VercelAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
dotenv.config();

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const appName = "tavily";

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
  const tools = await toolset.getTools({ apps: [appName,'webtool'] }, entity.id);
  const task = "You are a shopping assistant. You can use browser tool to search for links and information. Then suggest the best product out of all the comparisons. Also explain why the others arent better than the one youve recommended and provide the correct links to these products, use webtool to check whether the links are correct. Here's the product:";
  const product = 'Digital Camera at 10K INR';
  // Generate text using the model and tools
  const output = await generateText({
    model: openai("gpt-4o"),//groq("llama3-8b-8192"),
    streamText: false,
    tools: tools,
    prompt: task+product, 
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default");