import { fromGithub } from './agents/inputs';
import { initSWEAgent } from './agents/swe';
import { GOAL } from './prompts';

async function main() {
  /**Run the agent.**/
  const { assistantThread, llm, tools, composioToolset } = await initSWEAgent();
  // const { repo, issue } = await fromGithub(toolset);
  const repo = "utkarsh-dixit/speedy";
  const issue = "create a file api.rs in my project implementing API Client that implements all it's methods.";
  const assistant = await llm.beta.assistants.create({
    name: "SWE agent",
    instructions: GOAL + `\nRepo is: ${repo} and your goal is to ${issue}`,
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

  await composioToolset.waitAndHandleAssistantToolCalls(llm as any, stream, assistantThread, "default");

  const response = await composioToolset.executeAction("filetool_git_patch", {
    new_file_paths: ["."]
  });

  if (response.stderr && response.stderr.length > 0) {
    console.log('Error:', response.stderr);
  } else if (response.stdout) {
    console.log('=== Generated Patch ===\n' + response.stdout);
  } else {
    console.log('No output available');
  }

  await composioToolset.workspace.workspace?.teardown();
}

main();
