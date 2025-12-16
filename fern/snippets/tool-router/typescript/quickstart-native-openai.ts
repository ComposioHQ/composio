import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import OpenAI from "openai";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get Tool Router as a native tool
const toolRouter = await session.getToolRouter();

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("Assistant: What would you like me to do today?\n");

// Interactive loop
const messages: any[] = [];
while (true) {
  const userInput = await rl.question("> ");
  if (userInput === "exit") break;
  
  // Add user message
  messages.push({ role: "user", content: userInput });
  
  // Get response from OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: messages,
    tools: [toolRouter.tool],
    tool_choice: "auto",
  });
  
  const assistantMessage = response.choices[0].message;
  messages.push(assistantMessage);
  
  // Handle tool calls
  if (assistantMessage.tool_calls) {
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name === "composio_tool_router") {
        // Execute the tool
        const args = JSON.parse(toolCall.function.arguments);
        const result = await toolRouter.execute(args);
        
        // Add tool result to messages
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
    
    // Get final response after tool execution
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: messages,
      tools: [toolRouter.tool],
    });
    
    const finalMessage = finalResponse.choices[0].message;
    messages.push(finalMessage);
    console.log(`Assistant: ${finalMessage.content}\n`);
  } else {
    console.log(`Assistant: ${assistantMessage.content}\n`);
  }
}
rl.close();