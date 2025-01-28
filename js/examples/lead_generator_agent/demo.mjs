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
  const tools = await toolset.getTools({ apps: ["peopledatalabs","googlesheets"] }, entity.id);
  
  const leadDescription = 'Senior frontend developers in San Francisco';
  const spreadsheetid='14T4e0j1XsWjriQYeFMgkM2ihyvLAplPqB9q8hytytcw'
  // Generate text using the model and tools
  const output = await generateText({
    model: openai("gpt-4o"),
    streamText: false,
    tools: tools,
    prompt: `
            You are a lead research agent. Based on user input, find 10 relevant leads using people data labs.
            After finding the leads, create a Google Sheet with the details for the lead description: ${leadDescription}, and spreadsheet ID: ${spreadsheetid}.
            Print the list of people and their details and the link to the google sheet.
            `, 
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default_user");