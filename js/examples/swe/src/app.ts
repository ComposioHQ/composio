import { fromGithub } from './agents/inputs';
import { initSWEAgent } from './agents/agent';

async function main() {
  /**Run the agent.**/
  const { agent_executor, agent, tools, toolset } = await initSWEAgent();
//   const { repo, issue } = await fromGithub(toolset);
const repo = "utkarsh-dixit/speedy";
const issue = "update readme.md and fix all typos";
  console.log("Repo is", repo);
  console.log("Issue is", issue);
  await agent_executor.invoke({
    issue,
    repo
  });

  const response = await toolset.executeAction("GITCMDTOOL_GET_PATCH_CMD".toLocaleLowerCase(), {});
  console.log("Response is ", response);
  if (response.stderr && response.stderr.length > 0) {
    console.log('Error:', response.stderr);
  } else if (response.stdout) {
    console.log('=== Generated Patch ===\n' + response.stdout);
  } else {
    console.log('No output available');
  }
}

main();
