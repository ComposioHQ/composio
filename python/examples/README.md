# Composio Python examples

Most scripts live directly in this directory (`tools.py`, `auth_configs.py`, `connected_accounts.py`, `triggers.py`, `mcp_example.py`, ...); the tool-router scripts group into the `tool_router/` subdirectory.

## Run one example

```bash
cd python
uv sync
out=$(node ../scripts/examples-provision.mjs) && eval "$out"
uv run python examples/tools.py
```

`uv run python examples/<file>.py` runs a script against the workspace's virtual environment without needing to activate it first. Scripts in subdirectories take their subpath too, e.g. `uv run python examples/tool_router/tools.py`.

## Configuration

Examples read configuration from environment variables and raise a `KeyError` naming the missing variable if one isn't set:

- `COMPOSIO_API_KEY` — always required.
- `COMPOSIO_EXAMPLES_USER_ID` — the user id examples act as.
- `COMPOSIO_EXAMPLES_{GMAIL,GITHUB,SLACK}_AUTH_CONFIG_ID` and `COMPOSIO_EXAMPLES_{GMAIL,GITHUB,SLACK}_CONNECTED_ACCOUNT_ID` — per-toolkit auth config and standing connected account.
- `COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID` and `COMPOSIO_EXAMPLES_APIKEY_PLACEHOLDER` — the serpapi API-key auth config and its placeholder key value.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — only needed by examples that call that LLM provider.

`node ../scripts/examples-provision.mjs` (run from `python/`, or `node scripts/examples-provision.mjs` from the repo root) checks a Composio project for this state, prints a report to stderr, and prints `export COMPOSIO_EXAMPLES_*=...` lines to stdout. Load them with `out=$(node ../scripts/examples-provision.mjs) && eval "$out"`. Capture first, then eval. `eval "$(...)"` reports the status of the text it evaluates, so it would hide a failed provisioning run. It's idempotent — it verifies what already exists and only creates what's missing — and it never prints credential values.

Add `--initiate-missing` to also start an OAuth connection request for any toolkit (gmail, googledrive, github, slack) that has no active connected account yet; it prints an authorization URL to visit once in a browser. The serpapi API-key auth config is created automatically, no browser step needed.

Run `node ../scripts/examples-provision.mjs --gc` to delete what example runs leave behind: connected accounts that never reached ACTIVE, surplus serpapi demo accounts, and MCP configs from earlier runs. It skips anything created in the last 24h and only touches resources the examples created. It deletes for real, so preview it with `--gc --dry-run` first and point it only at the disposable examples project.

## A note on connection examples

`connected_accounts.py` demonstrates _creating_ a connection: it calls `initiate()`, prints `Visit this URL to authorize: ...`, then calls `wait_for_connection()`, which returns once the account is active or gives up after its default timeout. That wait needs a person to open the URL, so the example cannot finish on its own and automated runs skip it. Examples that _use_ a connection (calling a tool through Gmail, GitHub, or Slack) rely on the standing connected accounts that the provisioning script already verified are active.
