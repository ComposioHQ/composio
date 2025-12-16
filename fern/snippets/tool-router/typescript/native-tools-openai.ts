import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import OpenAI from "openai";

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

// Create a chat completion with the tool
const response = await openai.chat.completions.create({
  model: "gpt-4-turbo-preview",
  messages: [
    {
      role: "user",
      content: "Fetch all open issues from the composio GitHub repository " +
        "and create a summary of the top 5 by priority",
    },
  ],
  tools: [toolRouter.tool],
  tool_choice: "auto",
});

console.log("Assistant:", response.choices[0].message.content);

// Handle tool calls if the assistant wants to use Tool Router
const toolCalls = response.choices[0].message.tool_calls;
if (toolCalls && toolCalls.length > 0) {
  const toolCall = toolCalls[0];
  
  if (toolCall.function.name === "composio_tool_router") {
    // Execute the tool with Tool Router
    const args = JSON.parse(toolCall.function.arguments);
    const result = await toolRouter.execute(args);
    
    // Send the result back to OpenAI
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "user",
          content: "Fetch all open issues from the composio GitHub repository " +
            "and create a summary of the top 5 by priority",
        },
        response.choices[0].message,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        },
      ],
      tools: [toolRouter.tool],
    });
    
    console.log("Assistant:", finalResponse.choices[0].message.content);
  }
}