import { fromGithub } from './agents/inputs';
import { initSWEAgent } from './agents/swe';

async function main() {
  /**Run the agent.**/
  const { agent_executor, agent, tools, toolset } = await initSWEAgent();
  const { repo, issue } = await fromGithub(toolset);
  await agent_executor.invoke({
    issue,
    repo
  });

  const response = await toolset.executeAction("gitcmdtool_get_patch_cmd", {});

  if (response.stderr && response.stderr.length > 0) {
    console.log('Error:', response.stderr);
  } else if (response.stdout) {
    console.log('=== Generated Patch ===\n' + response.stdout);
  } else {
    console.log('No output available');
  }
}

main();
