# Composio TypeScript examples

Each directory here is its own private workspace package (`<name>-example`) showing one integration or feature: `openai/`, `anthropic/`, `langchain/`, `connected-accounts/`, `tools/`, `triggers/`, `mcp/`, `tool-router/`, and more.

## Run one example

```bash
cd ts
pnpm install
out=$(node ../scripts/examples-provision.mjs) && eval "$out"
pnpm --filter openai-example start
```

`pnpm --filter <package-name> start` runs the example with bun (see the `scripts.start` entry in that package's `package.json`). Some packages expose extra entrypoints alongside `start`, for example `openai-example` also has `start:chat-completion`, `start:assistant`, and `start:mcp` — check the package's `package.json` for the full list.

## Configuration

Examples read configuration from environment variables and fail loudly, naming the missing variable, if one isn't set:

- `COMPOSIO_API_KEY` — always required.
- `COMPOSIO_EXAMPLES_USER_ID` — the user id examples act as.
- `COMPOSIO_EXAMPLES_{GMAIL,GITHUB,SLACK}_AUTH_CONFIG_ID` and `COMPOSIO_EXAMPLES_{GMAIL,GITHUB,SLACK}_CONNECTED_ACCOUNT_ID` — per-toolkit auth config and standing connected account.
- `COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID` and `COMPOSIO_EXAMPLES_APIKEY_PLACEHOLDER` — the serpapi API-key auth config and its placeholder key value.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — only needed by examples that call that LLM provider.

`node ../scripts/examples-provision.mjs` (run from `ts/`, or `node scripts/examples-provision.mjs` from the repo root) checks a Composio project for this state, prints a report to stderr, and prints `export COMPOSIO_EXAMPLES_*=...` lines to stdout. Load them with `out=$(node ../scripts/examples-provision.mjs) && eval "$out"`. Capture first, then eval. `eval "$(...)"` reports the status of the text it evaluates, so it would hide a failed provisioning run. It's idempotent — it verifies what already exists and only creates what's missing — and it never prints credential values.

Add `--initiate-missing` to also start an OAuth connection request for any toolkit (gmail, googledrive, github, slack) that has no active connected account yet; it prints an authorization URL to visit once in a browser. The serpapi API-key auth config is created automatically, no browser step needed.

Run `node ../scripts/examples-provision.mjs --gc` to delete what example runs leave behind: connected accounts that never reached ACTIVE, surplus serpapi demo accounts, and MCP configs from earlier runs. It skips anything created in the last 24h and only touches resources the examples created. It deletes for real, so preview it with `--gc --dry-run` first and point it only at the disposable examples project.

## A note on connection examples

Examples that demonstrate _creating_ a connection (for example `connected-accounts/`) only initiate the OAuth flow and print a line like `Please visit the following URL to authorize the user: ...` — running them does not require you to complete that authorization. Examples that _use_ a connection (calling a tool through Gmail, GitHub, or Slack) rely on the standing connected accounts that the provisioning script already verified are active.
