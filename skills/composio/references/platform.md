# Composio Platform

Use this product when a developer is building an agent, application, or backend whose users connect their own accounts. Route by task instead of assuming every request is onboarding.

## Contents

1. [Choose the task](#choose-the-task)
2. [Establish project access](#establish-project-access)
3. [Integrate sessions](#integrate-sessions)
4. [Choose tools and authentication behavior](#choose-tools-and-authentication-behavior)
5. [Handle advanced product work](#handle-advanced-product-work)
6. [Verify setup when relevant](#verify-setup-when-relevant)
7. [Use canonical documentation](#use-canonical-documentation)

## Choose the task

- **Explain or discover:** answer from this guide and current documentation without changing code.
- **First-time setup:** establish project access and the smallest working SDK path.
- **Integrate or extend:** inspect the codebase and add Composio to the existing agent architecture.
- **Operate:** discover, authorize, and execute tools for the application's current user.
- **Debug or migrate:** inspect the log ID and current implementation before changing credentials or architecture.

When modifying code, first inspect and identify the language, package manager, agent or LLM framework, stable user or tenant ID, secret-loading mechanism, and smallest existing execution path where Composio tools belong. Extend that path; do not create a parallel demo agent when one already exists. Never infer filenames, framework choices, environment behavior, or identity fields that were not provided or observed.

Use progressive disclosure. The basic path is project access, the core SDK, one user-scoped session, and the existing agent's tool interface. Do not add toolkit filters, tag policies, sandbox changes, custom auth, provider adapters, or production hardening unless the request or inspected code requires them. If essential repository context is missing, give the minimum stable outline and ask only for the missing detail instead of filling a large example with placeholders.

## Establish project access

Choose exactly one credential path from context.

### Existing dashboard or repository credential

If `COMPOSIO_API_KEY` already exists, or the developer arrived from Dashboard Getting Started after copying an `ak_*` project key, use that credential from the repository's existing environment or secret mechanism.

In this path:

- Never run `composio dev init` or select another project.
- Never create, rotate, replace, print, echo, log, or request the key in chat.
- Check only whether the environment variable exists and is not visibly masked or placeholder-like.
- When it lives in a file, check that the file is ignored by source control without printing the matching line.
- Let the first SDK request validate the credential; length is not validation.

If the dashboard handoff is missing or masked, direct the developer back to Platform → project → Getting Started → Step 1. Do not silently switch to a provisioning flow.

### General first-time setup

If there is no existing project credential and no dashboard handoff, use the current first-time setup path:

```bash
curl -fsSL https://composio.dev/install | bash
composio login
composio dev init
```

`composio dev init` writes `COMPOSIO_API_KEY` and `COMPOSIO_TEST_USER_ID` to `.env.local`. Python dotenv does not load `.env.local` by default, so pass the path explicitly or move the variables through the project's normal secret mechanism. There is no bare `composio init` command.

Verification stamp: these commands were exercised against CLI 0.2.32 and 0.3.1 on 2026-08-06. If the installed version differs or behavior conflicts, check `composio dev --help` and current docs rather than forcing the stamped behavior.

### Install the SDK the codebase needs

```bash
npm install @composio/core
pip install composio
```

Add a provider adapter only when the existing framework needs one. Fetch the current provider index before naming a package:

```text
https://docs.composio.dev/docs/providers.md
```

Do not introduce another LLM framework solely to demonstrate Composio.

## Integrate sessions

A session is the runtime context for one application user. It carries identity, connections, tool scope, and sandbox configuration.

Trace the application's existing authenticated user or tenant ID and use that stable identifier. Do not add a parallel user system or share one placeholder identity across users.

TypeScript:

```typescript
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create(existingUserId);
const tools = await session.tools();
```

Python:

```python
from composio import Composio

composio = Composio()
session = composio.create(user_id=existing_user_id)
tools = session.tools()
```

Both SDKs also expose `composio.sessions.create(...)`; do not teach an artificial TypeScript/Python asymmetry. The SDK reads `COMPOSIO_API_KEY` from the environment, so do not pass it inline.

For a multi-turn conversation, persist the returned session ID and resume it instead of creating a fresh session on every message. Use the [Session API lookup](#look-up-the-session-api) below for exact method names and configuration shapes.

Pass the session tools to the repository's existing model or agent using its native tool integration. Preserve the current prompt, model, streaming, and request lifecycle unless tools require a targeted change.

### Look up the Session API

Fetch the relevant Markdown page directly when you need an exact signature, option shape, or return type. Search-result summaries can omit code:

- [TypeScript creation and reuse](https://docs.composio.dev/reference/sdk-reference/typescript/sessions.md)
- [TypeScript Session methods and results](https://docs.composio.dev/reference/sdk-reference/typescript/session.md)
- [Python Session methods and results](https://docs.composio.dev/reference/sdk-reference/python/session.md)
- [Create options and configuration updates in both languages](https://docs.composio.dev/docs/configuring-sessions.md)

Check the installed SDK version first. Prefer its bundled reference for that version when it differs from the current website. API discovery does not require constructing a client, providing an API key, or calling the backend. Public Session types can retain the former `ToolRouter` name; follow their definitions rather than guessing a renamed import.

## Choose tools and authentication behavior

For Instant Tools, read https://docs.composio.dev/docs/instant-tools.md before choosing authentication or usage settings. Use that guide for current eligibility, pricing, project access, Session controls, account routing, and charge reporting.

Sessions expose a small set of meta tools by default so the agent can discover integrations and authenticate at runtime:

- `COMPOSIO_SEARCH_TOOLS`
- `COMPOSIO_GET_TOOL_SCHEMAS`
- `COMPOSIO_MULTI_EXECUTE_TOOL`
- `COMPOSIO_MANAGE_CONNECTIONS`
- `COMPOSIO_WAIT_FOR_CONNECTIONS`
- `COMPOSIO_REMOTE_WORKBENCH`
- `COMPOSIO_REMOTE_BASH_TOOL`

Keep connection management enabled for interactive agents. It returns a Connect Link when a user needs to authorize an app; do not build a provider OAuth flow.

Before you restrict a session, check whether the request names a toolkit. A capability request such as "send an email" doesn't name Gmail, Outlook, or any other toolkit. Keep the default meta tools so the agent can find the toolkit and tool with `COMPOSIO_SEARCH_TOOLS`. Restrict the session only when the user, the application's configuration, or the inspected code names the toolkit. Then enable only that toolkit and keep the meta tools.

Use the direct-tools preset only for a narrow, deterministic agent with a fixed allowlist. It removes meta tools by default. Re-enable connection management when users must authenticate in the agent, and keep or disable the sandbox deliberately. Fetch `configuring-sessions.md` for the current preset and option syntax before implementing it.

If the application has its own connect UI, use session authorization and connection-state methods and suppress in-chat connection prompts. Use managed auth initially. Create a custom auth config only for the application's OAuth branding, additional scopes, dedicated provider quotas, or self-hosted or regional requirements.

## Handle advanced product work

Do not force advanced requests through first-time setup. Route them to current documentation:

- Session scoping, account selection, callbacks, direct tools, and sandbox controls: `configuring-sessions.md`
- Asking the user before a tool runs: `approvals.md`, covered in [Require approval before tools run](#require-approval-before-tools-run)
- Blocking tool calls, tool results, or prompt injection: `firewall.md`, covered in [Block calls and results with Firewall](#block-calls-and-results-with-firewall)
- Adding a remote MCP server as a toolkit: `extending-sessions/custom-mcp.md`, covered in [Add a remote MCP server](#add-a-remote-mcp-server)
- Custom tools and toolkits that run in the application, or proxy execution: the other `extending-sessions` guides
- Custom connection UI: `authentication/manually-authenticating.md`
- Triggers and webhooks: `triggers.md` and the setting-up-triggers guides
- Legacy direct execution, MCP servers, or Tool Router migrations: the migration and sessions guides
- White labeling and custom OAuth apps: `white-labeling-authentication.md`

"Tool Router" is the former name for sessions. Treat direct execution as a migration path, not the default for new agent integrations.

Approvals, Firewall, and Custom MCP are experimental. Fetch their current page before writing code, check the installed SDK version against the minimum the page names, and copy the documented call shape for the requested language. Add them only when the request or inspected code asks for that control. A request like "ask before sending", "confirm before writes", or "human in the loop" asks for Approvals. A request like "never let the agent email pricing" or "stop prompt injection" asks for Firewall.

### Require approval before tools run

Approvals make Composio pause a tool call and ask the user before it runs. Composio doesn't run the tool. It returns an elicitation, then runs the tool when the call comes back with the user's answer.

Choose the gated tools when you create the session:

- By tag, session-wide: `tags={"require_approval": ["createHint", "updateHint", "destructiveHint"]}` in Python, `tags: { requireApproval: [...] }` in TypeScript.
- By tag, per toolkit: set `tools.<toolkit>.tags`. It replaces the session-wide `tags` for that toolkit, including blocked tags, so list everything that toolkit still needs.
- By tool: set `tools.<toolkit>.require_approval` (`requireApproval` in TypeScript) to exact tool slugs. Prefer explicit slugs for anything that must always be gated: Composio assigns tags on a best-effort basis.

Handle the pause in the application's tool loop:

1. Run tools with `session.execute()`. The SDK's `handle_tool_calls` and framework providers don't handle approvals yet.
2. Catch `ToolInputRequiredError` (Python, from `composio.exceptions`) or `ComposioToolInputRequiredError` (TypeScript). Over the API, the response has `"result_type": "input_required"`.
3. Show the user each entry in `input_requests`: its `message`, and a form built from its `requested_schema`. Build the form from the schema, since choices vary. One call can return several questions, for example from `COMPOSIO_MULTI_EXECUTE_TOOL`.
4. Retry the same call with `input_responses` (each `{"action": "accept", "content": {...}}`, keyed by question ID) and the returned `request_state`.

An **Always approve** answer lasts for the rest of the session for that tool on the same connected account.

Over MCP, clients that support elicitation ask the user themselves. Clients without elicitation support get the call denied, unless the session sets `experimental.no_elicitation_support_fallback` to `"allow"`. Only suggest that fallback when the developer accepts running those tools without approval.

Tell the developer about the documented limits when they matter: Workbench and bash scripts can call tools the approval check misses (disable the sandbox if approval must never be skipped), and `session.proxy_execute()` is disabled for a toolkit with any approval-gated tool.

### Block calls and results with Firewall

Firewall blocks tool calls the agent shouldn't make and tool results it shouldn't read. Configure it with session `hooks`. Each hook needs a unique `id`, a `type`, an `applies_to` (`appliesTo` in TypeScript) of toolkit slugs or `"all"`, and a `handler`.

- `before_execute` with a `condition_check` handler blocks a call before it runs, such as emailing internal pricing to a customer.
- `after_execute` with a `condition_check` handler blocks a result before the agent reads it, such as an email that contains an API key.
- `after_execute` with a `prompt_injection_check` handler blocks results that contain prompt injection. It works only in `after_execute`.

Write each `condition` as a description of what to block, not as an instruction to the agent. "Sharing internal pricing with anyone outside acme.com" works. "Don't share internal pricing" does not.

A blocked call returns `result_type` `blocked`, the error `Blocked by session policy`, and a `block_reason` and `hook_results` naming the hook. This is a policy outcome, not a tool or auth failure. Don't retry it or reconnect the account.

`session.update(hooks=[...])` replaces the whole hook list, so include every hook to keep. Hooks don't run on meta tools themselves, but they do check tool calls made through multi-execute, Workbench scripts, and proxy calls. Firewall is a paid-plan feature, and with Zero Data Retention the classifier judges each call without earlier session context.

### Add a remote MCP server

Custom MCP adds a remote MCP server as a Composio toolkit, so its tools sit next to Composio's toolkits in a session. Use it for an MCP server on a public HTTPS URL. Use Custom Tools and Toolkits instead for functions that run inside the application.

1. Create the toolkit with `composio.experimental.custom_toolkits.create()` in Python or `composio.experimental.customToolkits.create()` in TypeScript. Pass `name`, the final MCP endpoint as `app_url` (no redirects, no keys in the URL), `auth_schemes`, and `user_id`.
2. Store the returned `CUSTOM_*` slug. Never construct it yourself.
3. If a private toolkit needs auth, send its user to the returned `connect_link.redirect_url`. `connect_link` is `null` for shared and no-auth toolkits. Tools sync on creation for no-auth servers, and when the first account connects otherwise.
4. Add the slug to a session's toolkits. The agent finds the tools with `COMPOSIO_SEARCH_TOOLS`.

Choose `user_id` deliberately: `"all"` shares the toolkit with every user in the project, and a user ID makes it private to that user. Choose `auth_schemes` mode `NO_AUTH`, `API_KEY` (a header containing `{{generic_api_key}}`), or `DCR_OAUTH` (with a `discovery_url`). `app_url`, `auth_schemes`, and `user_id` can't change later: delete and create the toolkit again.

Know the limits before promising a design: remote servers only (no local or STDIO), at most 500 tools, OAuth only through Dynamic Client Registration, and no automatic resync. Call `sync()` when the server's tools change. `upsert()` is deprecated: new code uses `create()` and `update()`.

## Verify setup when relevant

For a first-time setup or integration request, success means a programmatic, safe, read-only tool call from the developer's real execution path returns an actual provider result and a non-empty Composio log ID.

Ask which integration the developer wants to try unless the application already makes the choice clear. Discover the real toolkit and tool at runtime. If the current user is not connected, check the Instant Tools guide before assuming a connection is required. When authentication is required, return the Connect Link, wait for authorization, and retry.

A mock, Playground run, tool search, schema fetch, session creation, or Connect Link alone does not prove the integration. If the repository has no runnable agent loop, add only the smallest entrypoint compatible with its existing provider; do not require another hosted model.

After success, report the code location, identity and session mapping, integration and tool, safe result summary, log ID, and useful dashboard destinations. For an explanation, migration plan, or narrow bug fix, use that task's own completion condition instead of forcing a new tool call.

## Use canonical documentation

Fetch current Markdown before giving version-sensitive commands or editing SDK integration code:

```text
https://docs.composio.dev/llms.txt
https://docs.composio.dev/docs/<page>.md
https://docs.composio.dev/toolkits/<toolkit>.md
```

Read [Errors and provider gotchas](errors.md) for failures shared across products.

## Do not

- Do not replace a dashboard-provided credential with a general setup flow.
- Do not stop at documentation when the user asked for implementation.
- Do not guess toolkit or tool slugs.
- Do not create auth configs as a universal prerequisite.
- Do not replace the application's identity model or agent architecture.
- Do not claim an integration works before the requested proof succeeds.
