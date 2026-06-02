import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  streamText,
  convertToModelMessages,
  generateId,
  stepCountIs,
  type UIMessage,
} from "ai";

const composio = new Composio({ provider: new VercelProvider() });

// In production, store session IDs per user in your database
let sessionId: string | null = null;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Reuse existing session or create a new one
  const session = sessionId
    ? await composio.use(sessionId)
    : await composio.create("user_123");
  sessionId = session.sessionId;

  const tools = await session.tools();

  const result = streamText({
    model: openai("gpt-5.4"),
    system: "You are a helpful assistant. Use Composio tools to help the user.",
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => generateId(),
  });
}
