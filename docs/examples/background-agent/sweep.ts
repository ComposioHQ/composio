import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

// #region setup
const composio = new Composio({ provider: new VercelProvider() });
const userId = process.env.COMPOSIO_USER_ID ?? "default";
const model = openai("gpt-5.2");
// #endregion setup

// #region sweep
async function sweep() {
  const session = await composio.create(userId);
  const tools = await session.tools();

  const { text } = await generateText({
    model,
    tools,
    stopWhen: stepCountIs(15),
    prompt: `You are an autonomous background agent running a scheduled sweep.

Do the following, in order:

1. **GitHub**:Find pull requests where my review is requested.
   List each PR with its title, repo, and link.

2. **Gmail**:Find emails from the last 24 hours that I haven't replied to.
   List each with sender and subject.

3. **Slack**: Post a concise summary of your findings to the #morning-sweep channel.
   Format it as a digest with sections for PRs and emails.
   If nothing was found, say so.

If an app is not connected, skip it and note it in the summary.
Be concise and actionable.`,
  });

  console.log(text);
}

sweep();
// #endregion sweep
