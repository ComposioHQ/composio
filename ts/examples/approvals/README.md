# Session approvals

Ask before running a tool, then resume the same call with your answer. These examples use read-only Hacker News lookups so you can try every choice without a connected account or model API key.

From the repository root, install dependencies and build the SDK:

```bash
pnpm install
pnpm exec turbo build --filter=@composio/core
export COMPOSIO_API_KEY=your_project_key
pnpm --filter approvals-example start
```

To use staging, also set `COMPOSIO_BASE_URL=https://staging-backend.composio.dev`. Otherwise the SDK uses production.

## Choose an answer

The terminal prints the tool call and reads the decision choices from the returned schema. Enter `approve`, `always_approve`, or `deny` when offered. You can also enter `decline` or `cancel` to return those MCP elicitation actions without form content. An invalid choice asks again.

`deny` is a submitted form decision (`action: 'accept'`, `content: { decision: 'deny' }`). `decline` and `cancel` are protocol actions. All three are forwarded unchanged, and Composio decides the execution result. `always_approve` applies to that tool and connected account for the rest of the Session.

[`approval.ts`](src/approval.ts) waits for every answer before repeating the original call with `inputResponses` and the opaque `requestState`. It handles another input request if needed and propagates other execution errors. This terminal UI supports approval decision forms. Build a complete schema renderer for other elicitation forms.

## Run the Python version

```bash
uv sync --project python --frozen
uv run --project python python python/examples/approvals.py
```

The [Python example](../../../python/examples/approvals.py) uses the same flow with `input_responses` and `request_state`. Closing its terminal prompt returns `cancel`.

## Answer several questions

```bash
pnpm --filter approvals-example start:multi
uv run --project python python python/examples/approvals.py --multi
```

These calls use `session.executeMeta()` / `session.execute_meta()` with `COMPOSIO_MULTI_EXECUTE_TOOL` to look up a Hacker News user and the latest item ID. Try approving one and denying the other. The helpers collect every returned question by ID before resuming the batch. Inspect each tool's result; a completed meta-tool response can contain denied or failed app-tool calls.

## Connect an MCP client

```bash
pnpm --filter approvals-example start:mcp
```

[`mcp.ts`](src/mcp.ts) creates a Session with `mcp: true`, connects with `session.mcp.url` and `session.mcp.headers`, advertises form elicitation, and registers an `elicitation/create` handler. The handler uses the same terminal prompt. The client calls `COMPOSIO_MULTI_EXECUTE_TOOL` and Composio asks for input over MCP; your application doesn't resubmit an SDK call.

To try a client without elicitation support:

```bash
pnpm --filter approvals-example exec bun src/mcp.ts --no-elicitation
```

The example explicitly sets `noElicitationSupportFallback: 'deny'`. The calls are denied without a prompt. Keep this fallback when approval is required. Clients such as Claude Code supply their own elicitation UI; this example shows how to implement that part in your own client.

## CI coverage

Pull requests run the terminal and continuation tests in `.github/workflows/ts.examples.yml` and `.github/workflows/py.test.yml`. The TypeScript tests also connect the actual example MCP client to an in-memory MCP server and check answer forwarding and capability negotiation. These tests need no credentials.

Run them locally:

```bash
pnpm --filter approvals-example test
uv run --project python pytest python/tests/test_approval_examples.py
```

The existing staging manifest sweep runs three unattended entries nightly and on demand:

| Manifest entry            | Backend assertions                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts/approvals/verify`     | Approval is requested; approve succeeds; deny, decline, and cancel fail for approval reasons; Always approve suppresses the next prompt; a mixed batch has one success and one denial. |
| `py/approvals/verify`     | The same assertions through the Python SDK.                                                                                                                                            |
| `ts/approvals/verify-mcp` | An elicitation-capable client receives questions and runs the tools; a client without elicitation is denied.                                                                           |

Run just those entries against a disposable staging project:

```bash
COMPOSIO_BASE_URL=https://staging-backend.composio.dev \
  node harness/run.mjs sweep --llm mock \
  --ids ts/approvals/verify,py/approvals/verify,ts/approvals/verify-mcp
```

The verification scripts supply fixed answers only for the explicitly gated read-only tools in this example. Keep human input in application flows. Each script creates fresh Sessions, fails if approval was skipped, and deletes its Sessions in `finally`. The interactive entrypoints are excluded from unattended sweeps so CI never waits for terminal input. Missing credentials fail verification; they don't count as passing coverage.

See the [approvals guide](https://docs.composio.dev/docs/approvals) for configuration and current limitations.
