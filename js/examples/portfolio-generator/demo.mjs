import { VercelAIToolSet } from "composio-core";
import { openai } from "../utils.mjs"; // Comment this to use the default openai 
// import { openai } from "@ai-sdk/openai"; // Uncomment this to use the default openai 
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
  //const entity = await toolset.client.getEntity(entityName);
  //await setupUserConnectionIfNotExists(entity.id);

  // Retrieve tools for the specified app
  const tools = await toolset.getTools({ apps: ['codeinterpreter','googledocs'] });
  // Generate text using the model and tools
  const info = `I am a software engineer with 5 years of experience in the field. I have worked on multiple projects like a chatbot and a web app. I have a strong understanding of software development. I am currently looking for a new job and am open to opportunities in the San Francisco Bay Area.`;
  const output = await generateText({
    model: openai("gpt-3.5-turbo"),
    streamText: false,
    tools: tools,
    prompt: `Based on my info: ${info} and generate the reactjs code for a portfolio website, also give the folder directory and steps to set it up. Then put all of it in a google doc`,
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default");