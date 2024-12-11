import dotenv from "dotenv";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { LangchainToolSet } from "composio-core";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatMistralAI } from "@langchain/mistralai";

dotenv.config();

// Initialize the toolset
const toolset = new LangchainToolSet({ apiKey: process.env.COMPOSIO_API_KEY });

// Create Gmail integration with Composio
async function setupUserConnection(entityId) {
  const entity = toolset.client.getEntity(entityId);
  const connection = await entity.getConnection("gmail");

  if (!connection) {
    // If this entity/user hasn't already connected the account
    const connection = await entity.initiateConnection("gmail");
    console.log("Log in via: ", connection.redirectUrl);

    return connection.waitUntilActive(100);
  }
  return connection;
}

async function executeAgent(entityName) {

  // Create entity and set up user connection
  const entity = await toolset.client.getEntity(entityName);
  const a = await setupUserConnection(entity.id);

  // Get the desired actions
  const tools = await toolset.getTools(
    {
      actions: [
        "gmail_send_email",
        "gmail_fetch_emails",
        "gmail_create_email_draft",
        "gmail_create_label",
      ],
    },
    entity.id
  );

  // Initialize the LLM
  const llm = new ChatMistralAI({
    model: "mistral-large-latest",
    apiKey: process.env.MISTRAL_API_KEY,
  });

  // Create custom prompt
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a helpful and thorough AI email assistant who can write and fetch emails, create draft mails and also create new gmail labels. Your goal is to understand the guidelines provided by the user and perform the specific actions requested by the user. If the user asks to fetch emails, use the actual data from the API response and print the result including these terms: Subject and Mail in an easy-to-read format.",
    ],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // Create the agent
  const agent = await createToolCallingAgent({
    llm,
    tools: tools,
    prompt,
  });

  // Execute the agent
  const agentExecutor = new AgentExecutor({ agent, tools, verbose: true });
  const result = await agentExecutor.invoke({
    // Customize the input -
    input: "Send a mail to example@gmail.com saying Hello",
  });

  console.log(result.output);
}
executeAgent("default");