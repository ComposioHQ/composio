/**
 * Local Sandbox on Tenki Example
 *
 * Composio's local sandbox lets you run tool-calling code inside a sandbox
 * *you* own, while Composio keeps managed auth and tool discovery. This
 * example uses Tenki (https://tenki.cloud) as that sandbox: a disposable
 * Linux microVM that boots in ~2 seconds and is destroyed at the end.
 *
 * Tenki is isolated behind the sandbox contract in `src/sandbox/tenki.ts`
 * (`createTenkiSandbox` -> `UserSandbox`), the same shape as the canonical
 * local-sandbox example's E2B runner — swap the factory to run on any box
 * that honors the contract.
 *
 * Flow:
 *   1. Create a Composio session with the remote sandbox disabled
 *   2. Get the local-workbench pieces: a Python helper + the env it needs
 *   3. Boot a Tenki microVM behind the sandbox contract (helper injected)
 *   4. Run agent code inside the guest — it calls Composio tools through
 *      the helper, so execution stays inside your security boundary
 *   5. Tear the microVM down (a max-duration backstop covers host crashes)
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
import 'dotenv/config';
import { commandErrorText, createTenkiSandbox } from './sandbox/tenki';

/**
 * Agent code that runs *inside* the microVM. The injected composio_helper.py
 * is the only Composio-specific thing the guest carries: tool calls route
 * back through the Tool Router session created by the host, so auth and
 * discovery stay managed while execution happens in your box.
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
    // `mcp: true` only affects the *type* of the returned session (the hosted
    // MCP endpoint exists at runtime either way); it yields the full `Session`
    // that experimental_createLocalWorkbenchSession expects.
    mcp: true,
  });
  console.log(`✅ Session: ${session.sessionId}`);

  // The two pieces you run yourself: a Python helper (source) + its env.
  const { helperSource, env } = await experimental_createLocalWorkbenchSession(composio, session);

  console.log('🚀 Booting a Tenki microVM...');
  const startedAt = Date.now();
  const sandbox = await createTenkiSandbox({
    apiKey: process.env.TENKI_API_KEY!,
    timeoutMs: 120_000, // creation + readiness budget; failed boots are terminated
    maxDurationMs: 15 * 60_000, // backstop if this host dies before teardown()
    remoteDir: '/home/tenki/composio',
    helperSource,
    // SECURITY: this env contains your Composio *project* API key and is
    // passed to the process running in the sandbox. Anything running there
    // can read it — treat the sandbox as your trust boundary and rotate the
    // key if a run could have leaked it.
    env,
    workspaceId: process.env.TENKI_WORKSPACE_ID,
    projectId: process.env.TENKI_PROJECT_ID,
  });
  console.log(`✅ microVM ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  try {
    console.log('📄 Injecting the agent script...');
    await sandbox.writeFile(`${sandbox.remoteDir}/agent.py`, AGENT_SCRIPT);

    console.log('🤖 Running the agent inside the microVM...\n');
    await sandbox.run(`cd ${sandbox.remoteDir} && python3 agent.py`, {
      timeoutMs: 120_000,
      env: sandbox.env,
      onStdout: chunk => process.stdout.write(chunk),
      onStderr: chunk => process.stderr.write(chunk),
    });

    console.log('\n✅ Done. Tool execution ran inside your microVM;');
    console.log('   auth and tool discovery stayed managed by Composio.');
  } catch (error) {
    console.error(`❌ Agent run failed: ${commandErrorText(error)}`);
    process.exitCode = 1;
  } finally {
    console.log('🧹 Terminating the microVM...');
    await sandbox.teardown();
  }
}

main().catch(error => {
  console.error('❌ Error running example:', error);
  process.exit(1);
});
