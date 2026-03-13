import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { OpenAI } from "openai";
import { Composio } from "@composio/core";
import { OpenAIProvider } from "@composio/openai";

// #region setup
const composio = new Composio({ provider: new OpenAIProvider() });
const openai = new OpenAI();

const app = new Hono();
// #endregion setup

// #region chat
app.post("/chat", async (c) => {
  const { userId, message } = await c.req.json();

  const session = await composio.create(userId);
  const tools = await session.tools();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant. Use tools to help the user." },
    { role: "user", content: message },
  ];

  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      tools,
      messages,
    });

    const choice = response.choices[0];
    if (!choice.message.tool_calls?.length) {
      return c.json({ response: choice.message.content });
    }

    messages.push(choice.message);
    const toolResults = await composio.provider.handleToolCalls(userId, response);
    messages.push(...toolResults);
  }
});
// #endregion chat

// #region list-connections
app.get("/connections/:userId", async (c) => {
  const userId = c.req.param("userId");

  const session = await composio.create(userId);
  const toolkits = await session.toolkits();

  return c.json(
    toolkits.items.map((t) => ({
      toolkit: t.slug,
      connected: t.connection?.isActive ?? false,
    }))
  );
});
// #endregion list-connections

// #region check-connection
app.get("/connections/:userId/:toolkit", async (c) => {
  const userId = c.req.param("userId");
  const toolkit = c.req.param("toolkit");

  const session = await composio.create(userId, { toolkits: [toolkit] });
  const result = await session.toolkits();
  const match = result.items.find((t) => t.slug === toolkit);

  return c.json({ toolkit, connected: match?.connection?.isActive ?? false });
});
// #endregion check-connection

// #region connect
app.post("/connect/:toolkit", async (c) => {
  const toolkit = c.req.param("toolkit");
  const { userId } = await c.req.json();

  const session = await composio.create(userId, { toolkits: [toolkit] });
  const connectionRequest = await session.authorize(toolkit);

  return c.json({ redirectUrl: connectionRequest.redirectUrl });
});
// #endregion connect

serve({ fetch: app.fetch, port: 8000 });
console.log("Server running on http://localhost:8000");
