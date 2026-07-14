/**
 * Local Sandbox on Tenki Example
 *
 * Composio's local sandbox lets you run tool-calling code inside a sandbox
 * *you* own, while Composio keeps managed auth and tool discovery. This
 * example uses Tenki (https://tenki.cloud) as that sandbox: a disposable
 * Linux microVM that boots in ~2 seconds and is destroyed at the end.
 *
 * Flow:
 *   1. Create a Composio session with the remote sandbox disabled
 *   2. Get the local-workbench pieces: a Python helper + the env it needs
 *   3. Boot a Tenki microVM with that env, inject the helper
 *   4. Run agent code inside the guest — it calls Composio tools through
 *      the helper, so execution stays inside your security boundary
 *   5. Terminate the microVM
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY (https://app.composio.dev)
 *   - TENKI_API_KEY    (https://app.tenki.cloud)
 *
 * Docs:
 *   - https://docs.composio.dev/docs/sandbox/local
 *   - https://tenki.cloud/docs/sandbox/sdk
 */
import { Composio } from '@composio/core';
import { experimental_createLocalWorkbenchSession } from '@composio/experimental/workbench';
import { TenkiSandbox } from '@tenkicloud/sandbox';
import 'dotenv/config';

const GUEST_HOME = '/home/tenki';

/**
 * Agent code that runs *inside* the Tenki microVM. The injected
 * composio_helper.py is the only Composio-specific thing the guest carries:
 * tool calls route back through the Tool Router session created by the host,
 * so auth and discovery stay managed while execution happens in your box.
 */
const AGENT_SCRIPT = `"""Agent code running inside the Tenki microVM."""
import json
import platform

from composio_helper import run_composio_tool

print(f"[guest] hello from {platform.node()} ({platform.system()} {platform.release()})")
print("[guest] calling HACKERNEWS_GET_USER through the Composio Tool Router...")

response, error = run_composio_tool("HACKERNEWS_GET_USER", {"username": "pg"})
if error:
    raise SystemExit(f"[guest] tool call failed: {error}")

print("[guest] tool response:")
print(json.dumps(response, indent=2))
`;

/**
 * Boot a Tenki microVM. Session creation needs a project; discover one from
 * the API key's identity (override with TENKI_WORKSPACE_ID / TENKI_PROJECT_ID).
 */
async function createTenkiMicroVm(tenki: TenkiSandbox, env: Record<string, string>) {
  const identity = await tenki.whoAmI();
  const workspace =
    identity.workspaces.find(ws => ws.id === process.env.TENKI_WORKSPACE_ID) ??
    identity.workspaces[0];
  const project =
    workspace?.projects.find(p => p.id === process.env.TENKI_PROJECT_ID) ?? workspace?.projects[0];
  if (!workspace || !project) {
    throw new Error('No Tenki workspace/project visible for this API key');
  }

  return tenki.createAndWait({
    name: 'composio-local-sandbox',
    workspaceId: workspace.id,
    projectId: project.id,
    // The helper calls Composio's backend from inside the guest.
    allowOutbound: true,
    // SECURITY: this env contains your Composio *project* API key. Anything
    // running in the sandbox can read it — treat the sandbox as your trust
    // boundary and rotate the key if a run could have leaked it.
    env,
  });
}

async function main() {
  for (const name of ['COMPOSIO_API_KEY', 'TENKI_API_KEY']) {
    if (!process.env[name]) {
      console.error(`❌ Missing ${name}. Copy .env.example to .env and fill it in.`);
      process.exit(1);
    }
  }

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

  console.log('🚀 Creating a Composio session with the remote sandbox disabled...');
  const session = await composio.sessions.create('default', {
    toolkits: ['hackernews'], // no OAuth needed, so the example runs as-is
    sandbox: { enable: false }, // code execution happens in OUR box instead
  });
  console.log(`✅ Session: ${session.sessionId}`);

  // The two pieces you run yourself: a Python helper (source) + its env.
  const { helperSource, env } = await experimental_createLocalWorkbenchSession(composio, session);

  console.log('🚀 Booting a Tenki microVM...');
  const tenki = new TenkiSandbox(); // reads TENKI_API_KEY from the environment
  const startedAt = Date.now();
  const microVm = await createTenkiMicroVm(tenki, env);
  console.log(`✅ microVM ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  try {
    const python = await microVm.exec('bash', { args: ['-lc', 'command -v python3'] });
    if (python.exitCode !== 0) {
      throw new Error('python3 not found in the guest image; pick an image that ships Python 3');
    }

    console.log('📄 Injecting composio_helper.py and the agent script...');
    await microVm.writeFile(`${GUEST_HOME}/composio_helper.py`, helperSource);
    await microVm.writeFile(`${GUEST_HOME}/agent.py`, AGENT_SCRIPT);

    console.log('🤖 Running the agent inside the microVM...\n');
    const result = await microVm.exec('python3', {
      args: [`${GUEST_HOME}/agent.py`],
      timeoutMs: 120_000,
      onOutput: chunk => process.stdout.write(chunk.data),
    });
    if (result.exitCode !== 0) {
      throw new Error(`agent exited with code ${result.exitCode}`);
    }

    console.log('\n✅ Done. Tool execution ran inside your microVM;');
    console.log('   auth and tool discovery stayed managed by Composio.');
  } finally {
    console.log('🧹 Terminating the microVM...');
    await microVm.close();
  }
}

main().catch(error => {
  console.error('❌ Error running example:', error);
  process.exit(1);
});
