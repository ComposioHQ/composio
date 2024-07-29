import { fromGithub, getBranchNameFromIssue } from './utils';
import { initSWEAgent } from './agents/swe';
import { GOAL } from './prompts';
import { OpenAIToolSet, Workspace } from 'composio-core';

async function main() {
  /**Run the agent.**/
  const { assistantThread, llm, tools, composioToolset } = await initSWEAgent();
  const { repo, issue } = await fromGithub(composioToolset);

  const assistant = await llm.beta.assistants.create({
    name: "SWE agent",
    instructions: GOAL + `\nRepo is: ${repo} and your goal is to ${issue}`,
    model: "gpt-4o",
    tools: tools
  });

  await llm.beta.threads.messages.create(
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
 
  await composioToolset.waitAndHandleAssistantToolCalls(llm as any, stream, assistantThread, "default");

  const response = await composioToolset.executeAction("filetool_git_patch", {
  });

  if (response.patch && response.patch?.length > 0) {
    console.log('=== Generated Patch ===\n' + response.patch, response);
    const branchName = getBranchNameFromIssue(issue);
    const output = await composioToolset.executeAction("SHELL_EXEC_COMMAND", {
      cmd: `cp -r ${response.current_working_directory} git_repo && cd git_repo && git config --global --add safe.directory '*' && git config --global user.name 'Utkarsh Dixit' && git config --global user.email utkarshdix02@gmail.com && git checkout -b ${branchName} && git commit -m 'feat: ${issue}' && git push origin ${branchName}`
    });

    // Wait for 2s
    await new Promise((resolve) => setTimeout(() => resolve(true), 2000));

    console.log("Have pushed the code changes to the repo. Let's create the PR now", output);

    await composioToolset.executeAction("GITHUB_PULLS_CREATE", {
      owner: repo.split("/")[0],
      repo: repo.split("/")[1],
      head: branchName,
      base: "master",
      title: `SWE: ${issue}`
    })
  } else {
    console.log('No output available - no patch was generated :(');
  }
}

main();
