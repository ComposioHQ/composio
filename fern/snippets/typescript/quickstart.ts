import { Composio } from "@composio/core";
import { OpenAI } from "openai";

const openai = new OpenAI();
const composio = new Composio();

const userId = "your@email.com";

const connection = await composio.toolkits.authorize(userId, "github");

console.log(
  `🔗 Please authorize access by visiting this URL:\n👉 ${connection.redirectUrl}`
);

await connection.waitForConnection();

const tools = await composio.tools.get(
  userId,
  "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"
);

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: "Can you star the composiohq/composio repository?",
    },
  ],
  tools: tools,
});

if (completion.choices[0].message.tool_calls) {
  const toolResult = await composio.provider.executeToolCall(
    userId,
    completion.choices[0].message.tool_calls[0]
  );

  console.log("✅ Tool execution result:", JSON.parse(toolResult));
}
