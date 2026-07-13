/**
 * Cumulative stages of the local-workbench PR reviewer's host orchestration
 * file, built up one piece at a time. Each stage's `code` is the full file at
 * that point; <FileBuildup> diffs consecutive stages so the reader watches
 * `src/runner.ts` grow from a bare client into the full run loop.
 *
 * These are *teaching* stages: distilled and inlined from the real source
 * (src/runner.ts + src/workbench.ts + src/sandbox/e2b.ts) so each Composio
 * concept reads on its own, the way slack-bot-build.ts simplifies the Slack bot.
 *
 * Source: ComposioHQ/local-pr-reviewer @ c3baff810a6b8dbf1e2c1eff45ddc9785998e3e8
 * Refresh this map (and local-workbench-source.json) when that repo changes.
 *
 * This data is rendered via @pierre/diffs, NOT twoslash, so it is not
 * type-checked, because it deliberately uses the unreleased
 * experimental_createLocalWorkbenchSession export.
 */
import type { BuildStage } from './slack-bot-build';

const imports = `import { Composio } from '@composio/core';
import { experimental_createLocalWorkbenchSession } from '@composio/experimental/workbench';
import { createE2bSandbox } from './sandbox/e2b';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const userId = process.env.COMPOSIO_USER_ID ?? 'local-pr-reviewer-user';
`;

const stage1 = imports;

const stage2 = `${imports}
// Composio runs tools as a user. Before anything else, make sure this user has
// an active GitHub connection. There's no point booting a sandbox without one.
async function requireGithubConnection() {
  const list = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: ['github'],
    statuses: ['ACTIVE'],
  });
  if (list.items?.[0]) return;

  const request = await composio.toolkits.authorize(userId, 'github');
  throw new Error(\`Connect GitHub first: \${request.redirectUrl}\`);
}
`;

const stage3 = `${stage2}
// The local sandbox session. Create a normal Composio session yourself with
// \`workbench.enable: false\` (Composio won't run code for you), then hand that
// session to the helper, which validates it's local and gives you the pieces to
// run code yourself, wherever you choose.
async function createWorkbench() {
  const session = await composio.sessions.create(userId, {
    toolkits: ['github'],
    workbench: { enable: false },
  });
  return experimental_createLocalWorkbenchSession(composio, session);
  // returns { helperSource, env }:
  //   helperSource: a Python helper exposing run_composio_tool / invoke_llm / web_search
  //   env:          the variables that helper needs to reach Composio from inside your box
}
`;

const stage4 = `${stage3}
export async function runReview(repo: string, pr: number) {
  await requireGithubConnection();
  const workbench = await createWorkbench();

  // Start a sandbox you own, inject the helper, and pass the env. E2B is just
  // the sample runner; swap createE2bSandbox for any box that honors the same
  // contract: write a file, set env, run a command, stream output, tear down.
  const sandbox = await createE2bSandbox({
    apiKey: process.env.E2B_API_KEY,
    helperSource: workbench.helperSource, // written as composio_helper.py
    env: workbench.env,
  });
}
`;

const stage5 = `${stage3}
export async function runReview(repo: string, pr: number) {
  await requireGithubConnection();
  const workbench = await createWorkbench();

  // Start a sandbox you own, inject the helper, and pass the env. E2B is just
  // the sample runner; swap createE2bSandbox for any box that honors the same
  // contract: write a file, set env, run a command, stream output, tear down.
  const sandbox = await createE2bSandbox({
    apiKey: process.env.E2B_API_KEY,
    helperSource: workbench.helperSource, // written as composio_helper.py
    env: workbench.env,
  });

  // Run the reviewer agent inside the sandbox and stream its output back. The
  // agent calls run_composio_tool from composio_helper.py, which routes GitHub
  // actions back through Composio under this user's connection.
  const task = \`Review PR #\${pr} on \${repo}. Run the repo's real checks in this sandbox.\`;
  try {
    await sandbox.run('npx --yes tsx agent.ts', {
      env: { ...workbench.env, TASK: task, OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
  } finally {
    await sandbox.teardown();
  }
}
`;

const STAGES: { title: string; description: string; code: string }[] = [
  {
    title: 'Create the Composio client',
    description:
      'Start from scratch. One client, one stable user id. Everything below acts as this user, against the connections they own.',
    code: stage1,
  },
  {
    title: 'Check the GitHub connection',
    description:
      'A local sandbox still uses Composio for auth and tool discovery. Before booting any infrastructure, confirm this user has an active GitHub connection, and hand them a connect link if not.',
    code: stage2,
  },
  {
    title: 'Create the local sandbox session',
    description:
      'The whole idea. Create a Composio session yourself with workbench.enable: false (Composio will not run code for you), then hand that session to experimental_createLocalWorkbenchSession, which validates it is local and returns the helper source and env you run yourself.',
    code: stage3,
  },
  {
    title: 'Start your sandbox, inject the helper',
    description:
      'Boot a box you control, write helperSource into it as composio_helper.py, and pass env to the process. E2B is the sample runner; this is the only Composio-specific thing your sandbox must carry.',
    code: stage4,
  },
  {
    title: 'Run the reviewer and stream output',
    description:
      'Run the agent inside the sandbox. Whenever it calls run_composio_tool, the helper routes that GitHub action back through Composio under this user, so tool execution happens in your box, but discovery and auth stay managed.',
    code: stage5,
  },
];

export const FILE_BUILDS: Record<string, { file: string; stages: BuildStage[] }> = {
  reviewer: { file: 'src/runner.ts', stages: STAGES },
};
