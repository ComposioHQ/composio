import { openai } from "@ai-sdk/openai";
import { VercelAIToolSet, Composio, OpenAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
dotenv.config();

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});
// Subscribe to triggers and perform actions
await toolset.triggers.subscribe(async (data) => {
    console.log("trigger received", data);
    const payload = data.payload;
    const message = payload.messageText;
    const sender = payload.sender;
    const threadId = payload.threadId;
    const entity_id = 'default';
    
      // Setup entity and ensure connection
    const entity = await toolset.client.getEntity(entity_id);
    
      // Retrieve tools for the specified app
      const tools = await toolset.getTools({ apps: ["googlecalendar","gmail"] }, entity.id);
      
      // Generate text using the model and tools
      const output = await generateText({
        model: openai("gpt-4o"),
        streamText: false,
        tools: tools,
        prompt: `
                This is a message from ${sender}: ${message}
                Threadid:${threadId}
                This is the date: ${new Date().toISOString()}
                You are a scheduling agent, Read the email received and understand the content.
                After understanding the content, create a calendar event with the details.
                Then reply to the email with the calendar event details. If thread id is not provided, create a draft email.
                `, 
        maxToolRoundtrips: 5,
      });
    
      console.log("🎉Output from agent: ", output.text);

}, "GMAIL_NEW_GMAIL_MESSAGE");
