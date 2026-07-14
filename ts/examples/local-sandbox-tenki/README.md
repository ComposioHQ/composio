# Local Sandbox on Tenki Example

Run [Composio's local sandbox](https://docs.composio.dev/docs/sandbox/local) on [Tenki](https://tenki.cloud) — disposable Linux microVMs that boot in ~2 seconds, purpose-built for AI agents.

A **local sandbox** is a Composio session with the remote sandbox disabled: Composio still does managed auth and tool discovery, but code execution happens in a box _you_ own. This example uses a Tenki microVM as that box, so each run gets hardware-isolated, per-second-billed compute that is destroyed at the end.

## How it works

1. Create a Composio session with `sandbox: { enable: false }`.
2. `experimental_createLocalWorkbenchSession` returns the two pieces you run yourself: a Python **helper** (`composio_helper.py`) and the **env** it needs.
3. Boot a Tenki microVM with that env and write the helper into it.
4. Run agent code inside the guest. It imports the helper and calls `run_composio_tool(...)` — every call routes back through the Tool Router under the session's connections, so auth stays managed while execution stays inside your boundary.
5. Terminate the microVM.

The agent here calls a HackerNews tool because that toolkit needs no OAuth connection, so the example runs with just the two API keys.

## Setup

1. **Install dependencies** (from the repository root):

   ```bash
   pnpm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:
   - `COMPOSIO_API_KEY`: Get it from [Composio Dashboard](https://app.composio.dev)
   - `TENKI_API_KEY`: Get it from [Tenki Cloud](https://app.tenki.cloud) (workspace Settings → API Keys)

## Running the Example

```bash
# Run the example
pnpm start

# Run in development mode (with file watching)
pnpm dev
```

Expected output: the Composio session id, the microVM boot time, the guest's hostname, and the HackerNews tool response printed from inside the microVM.

## Security note

The `env` returned by `experimental_createLocalWorkbenchSession` contains your Composio **project** API key, and this example injects it into the sandbox. Anything running there can read it. Treat the sandbox as your trust boundary: use a key scoped to what the run needs, and rotate it if a run could have leaked it. Tenki microVMs are destroyed on `close()`, and each session is isolated from every other.

## Swapping the runtime

Tenki is one way to honor the local-sandbox contract. The contract itself is small: create a box, write `helperSource` into it as `composio_helper.py`, pass `env` to the process, and tear down on your schedule. See the [local sandbox docs](https://docs.composio.dev/docs/sandbox/local) for the details.

## Related Examples

- [Tool Router Example](../tool-router) - Session-based tool routing
- [Tools Example](../tools) - Direct tool execution
- [More Examples](../) - Browse all available examples

## Support

- [Composio Documentation](https://docs.composio.dev)
- [Tenki Sandbox Documentation](https://tenki.cloud/docs/sandbox/quick-start-sandbox)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/ComposioHQ/composio/issues)
