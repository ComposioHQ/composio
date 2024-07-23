import { fromGithub } from './agents/inputs';
import { initSWEAgent } from './agents/swe';

async function main() {
  /**Run the agent.**/
  const { assistantThread, llm, tools, composioToolset } = await initSWEAgent();
  // const { repo, issue } = await fromGithub(toolset);
  const repo = "utkarsh-dixit/speedy";
  const issue = "update readme.md and fix all typos";
  const assistant = await llm.beta.assistants.create({
    name: "SWE agent",
    instructions: `Repo is: ${repo} and your goal is to ${issue}`,
    model: "gpt-4-turbo",
    tools: tools
  });

  const message = await llm.beta.threads.messages.create(
    assistantThread.id,
    {
      role: "user",
      content: issue
    }
  );

  const stream = await llm.beta.threads.runs.createAndPoll(assistantThread.id, {
    assistant_id: assistant.id,
    instructions: `Repo is: ${repo} and your goal is to ${issue}`,
    tool_choice: "required"
  });

  // stream.on("textCreated", (text) => process.stdout.write('\nassistant > ')).on("toolCallCreated", (toolCall) => process.stdout.write(`\nassistant > ${toolCall.id}\n\n`))

  composioToolset.waitAndHandleAssistantToolCalls(llm as any, stream, assistantThread, "default");


}

main();
