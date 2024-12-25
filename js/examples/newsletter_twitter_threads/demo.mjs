import { openai } from "@ai-sdk/openai";
import {groq} from '@ai-sdk/groq'
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
  //await setupUserConnectionIfNotExists(entity.id);

  // Retrieve tools for the specified app
  const tools = await toolset.getTools({ actions: ["TWITTER_CREATION_OF_A_POST","TAVILY_TAVILY_SEARCH"] }, entity.id);
  

  // Generate text using the model and tools
  const output = await generateText({
    model: groq("llama-3.3-70b-versatile"),
    streamText: false,
    tools: tools,
    prompt: `
            You are a twitter thread posting agent. Your job is to follow these steps in order:
            1. Research on the topic given to you: "12 days of OpenAI"
            2. Understand the topic and post a tweet about it.
            3. Get the id of the posted tweet and post another tweet which contains the id of the previous tweet.
            4. Repeat this process for 5 tweets.
            5. Once everything is done, print the tweet you've posted and the link to it.
            `, 
    maxToolRoundtrips: 5,
  });

  console.log("🎉Output from agent: ", output.text);
}

executeAgent("default");