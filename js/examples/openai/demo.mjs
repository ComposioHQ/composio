import { OpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";
import dotenv from "dotenv";

dotenv.config();
const toolset = new OpenAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
  });
  

  async function setupUserConnectionIfNotExists(entityId) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection({app:'github'});
  
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
  
    const tools = await toolset.getTools({ actions: ["github_issues_create"] }, entity.id);
    const instruction = "Make an issue with sample title in the repo - himanshu-dixit/custom-repo-breaking"
  
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const assistant = await openai.beta.assistants.create({
      name: "Github Assistant",
      instructions: "You're a GitHub Assistant, you can do operations on GitHub",
      tools: tools,
      model: "gpt-4o-mini"
  });

  const thread = await openai.beta.threads.create();
  const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
      instructions: instruction,
      tools: tools,
      model: "gpt-4o-mini",
      stream: false
  });
  const call = await toolset.waitAndHandleAssistantToolCalls(openai, run, thread);
  console.log(call);

  }
  
  executeAgent("default")