# Composio Platform

Use this product when a developer is building an agent, application, or backend whose users connect their own accounts. Route by task instead of assuming every request is onboarding.

## Contents

1. [Choose the task](#choose-the-task)
2. [Inspect and route the repository](#inspect-and-route-the-repository)
3. [Establish project access](#establish-project-access)
4. [Integrate sessions](#integrate-sessions)
5. [Choose tools and authentication behavior](#choose-tools-and-authentication-behavior)
6. [Handle advanced product work](#handle-advanced-product-work)
7. [Verify setup when relevant](#verify-setup-when-relevant)
8. [Use canonical documentation](#use-canonical-documentation)

## Choose the task

- **Explain or discover:** answer from this guide and current documentation without changing code.
- **First-time setup:** establish project access and the smallest working SDK path.
- **Integrate or extend:** inspect the codebase and add Composio to the existing agent architecture.
- **Operate:** discover, authorize, and execute tools for the application's current user.
- **Debug or migrate:** inspect the log ID and current implementation before changing credentials or architecture.

When modifying code, first inspect and identify the language, framework, package manager, target package, server boundary, secret-loading mechanism, stable user or tenant ID source, current Composio usage, and smallest existing execution path where Composio tools belong. Never infer filenames, framework choices, environment behavior, or identity fields that were not provided or observed.

Use progressive disclosure. The basic path is project access, the core SDK, one user-scoped session, and the existing agent's tool interface. Do not add toolkit filters, tag policies, sandbox changes, custom auth, provider adapters, or production hardening unless the request or inspected code requires them. If essential repository context is missing, give the minimum stable outline and ask only for the missing detail instead of filling a large example with placeholders.

## Inspect and route the repository

Classify the repository before installing a dependency or choosing an example:

| Repository shape | Route |
|---|---|
| Existing TypeScript or Python agent | Extend its real execution path. Preserve its framework, prompts, model, request lifecycle, and authenticated user identity; do not add a demo agent. |
| Backend without an agent | Add the smallest server-side Composio module and proof entrypoint compatible with the application. Do not add an LLM. |
| Empty repository | Ask once whether to use TypeScript or Python, then scaffold only a minimal server-side proof. Do not add an agent framework or hosted model. |
| Frontend-only application | Stop before placing a project key in client code. Identify a server boundary and add or propose it only when the user authorizes that architecture change. |
| Monorepo or multiple applications | Identify the target package first. Install and edit only that package and its existing shared configuration when required. |
| Existing Composio implementation | Reuse and verify it. Migrate only when requested or required for correctness; do not duplicate it. |
| Unsupported runtime | Check current supported SDKs, then offer a supported server boundary. Do not guess a package or SDK. |

If the target, runtime, or server boundary remains ambiguous, ask one concise routing question before editing. Use the repository's existing dependency manager, secret mechanism, identity source, and validation commands.

## Establish project access

Choose exactly one credential path from context.

### Dashboard Getting Started handoff

Recognize this route whenever the request identifies Dashboard Getting Started or says the project key was copied, confirmed, or already handled there. The project ID strengthens attribution but is not required to select this route. Record only this non-secret context in the working plan:

```text
source = dashboard_getting_started
projectNanoId = <project ID from the handoff, when provided>
credentialHandoff = new_key_copied | existing_key_confirmed
```

Never add an API-key value, authorization header, or dashboard session data to the plan, chat transcript, source, URL, logs, or committed files. The project ID and handoff state are context, not credentials. Treat a Connect Link as ephemeral authorization state: present it only to the intended user when needed and never place it in the plan, source, logs, or committed artifacts.

Inspect first, then choose the exact server-side secret destination already used by the target package. It must be loaded by the real server execution path, excluded from browser bundles, and ignored by Git when file-backed. If no such destination exists, name the smallest server-side secret mechanism the repository can support and get authorization before adding a server boundary.

**Dashboard preflight gate:** before running a package manager, installing any package, creating a lockfile, or editing source or configuration, inspect the credential in the same runtime and target package that will execute Composio. Repository inspection may be read-only. Missing, empty, or placeholder credentials must return immediately with no mutation; installing and then reverting still fails this gate. Disable shell tracing and inspect only boolean or categorized state; never use `env`, `printenv`, `cat`, an echoed expansion, or a verbose/debug mode that could expose the value.

| Observed state | Required action |
|---|---|
| Missing | Stop and follow the `credentialHandoff` recovery below. Preserve all completed code work. |
| Empty or visibly masked/placeholder-like | Stop and follow the `credentialHandoff` recovery below. This includes values made only of mask glyphs such as `*`, `•`, `●`, or `x`, and literals such as `redacted`, `your-key`, or angle-bracket placeholders. Classify without printing the value. Do not treat prefix or length alone as validation. |
| Present and unmasked | Keep the value opaque and let a minimal SDK request validate it. |
| Invalid or revoked | Return to the named project's Getting Started credential-recovery path. Do not create a project or key automatically. |
| Valid for another project | Stop with a project-mismatch result and return to the expected project's credential-recovery path. |

For a missing or masked credential, branch on the recorded handoff: with `new_key_copied`, name the exact server-side destination and ask the developer to paste or replace the copied key there, not into chat; with `existing_key_confirmed`, return to the originating project's credential-recovery path or Getting Started Step 1 and do not imply that a key is on the clipboard.

Report only `credential_preflight = missing | masked_placeholder | invalid_or_revoked | wrong_project | passed`; never report the inspected value. Use `passed` only after the SDK accepts the credential.

When provided, treat `projectNanoId` as the expected project, but do not infer project identity from key shape, prefix, or length. Current project-management endpoints require a separate organization credential, and a project key is not guaranteed to disclose its project ID through the SDK. Do not request an organization key, initialize the CLI, or switch CLI projects solely to prove attribution. When it is absent, remain on the dashboard-handoff route and refer to the originating Getting Started page; never fall through to general initialization.

If a current safe SDK response or log record exposes project identity and `projectNanoId` was provided, compare them and stop on a mismatch; a match may be reported as `project_attribution = confirmed_by_response`. Otherwise continue the real provider proof and report `project_attribution = pending_dashboard_activation`. In both cases, ask the developer to confirm that the originating Getting Started page observes the successful call. Do not block the code integration proof only because project identity metadata is unavailable, and do not claim the dashboard flow is complete until its project-scoped activation is observed.

Throughout this route, never run `composio dev init`, initialize or select a project, create or rotate a key, or ask the developer to reveal the key in chat.

### Existing repository credential

Use this path outside a dashboard handoff when the request establishes an existing project or key, or when preflight finds a present, unmasked `COMPOSIO_API_KEY`. A placeholder in an example or template file alone does not prove an existing project.

In this path:

- Never run `composio dev init`, select another project, or create another key; the existing credential is authoritative.
- Never create, rotate, replace, print, echo, log, or request the key in chat.
- Check only whether the environment variable exists and is not visibly masked or placeholder-like.
- When it lives in a file, check that the file is ignored by source control without printing the matching line.
- Let the first SDK request validate the credential; length is not validation.

When context establishes an existing project but its value is missing, empty, or placeholder-like, stop and ask the developer to replace it in the same secret destination; do not fall through to general first-time setup. Route to that project's credential recovery when it is known, or ask which existing project owns the credential. When a template placeholder is the only project evidence, treat it as unconfigured and follow general first-time setup; ask one routing question first if the context is ambiguous.

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

For a multi-turn conversation, persist the returned session ID and resume it instead of creating a fresh session on every message. Confirm current method names against `configuring-sessions.md` before writing production code.

Pass the session tools to the repository's existing model or agent using its native tool integration. Preserve the current prompt, model, streaming, and request lifecycle unless tools require a targeted change.

## Choose tools and authentication behavior

Sessions expose a small set of meta tools by default so the agent can discover integrations and authenticate at runtime:

- `COMPOSIO_SEARCH_TOOLS`
- `COMPOSIO_GET_TOOL_SCHEMAS`
- `COMPOSIO_MULTI_EXECUTE_TOOL`
- `COMPOSIO_MANAGE_CONNECTIONS`
- `COMPOSIO_WAIT_FOR_CONNECTIONS`
- `COMPOSIO_REMOTE_WORKBENCH`
- `COMPOSIO_REMOTE_BASH_TOOL`

Keep connection management enabled for interactive agents. It returns a Connect Link when a user needs to authorize an app; do not build a provider OAuth flow.

When authorization is required, enter a supervised `pending_connection` state. Preserve the code and credential work already completed, present the one-time Connect Link only to the intended user through the normal application or CLI surface, and do not persist or replay it. Wait for the user when possible; otherwise report the exact command or entrypoint to resume. After the user confirms authorization, check connection state and retry the same safe call. A generated link is not activation or proof of a working integration.

Use the direct-tools preset only for a narrow, deterministic agent with a fixed allowlist. It removes meta tools by default. Re-enable connection management when users must authenticate in the agent, and keep or disable the sandbox deliberately. Fetch `configuring-sessions.md` for the current preset and option syntax before implementing it.

If the application has its own connect UI, use session authorization and connection-state methods and suppress in-chat connection prompts. Use managed auth initially. Create a custom auth config only for the application's OAuth branding, additional scopes, dedicated provider quotas, or self-hosted or regional requirements.

## Handle advanced product work

Do not force advanced requests through first-time setup. Route them to current documentation:

- Session scoping, account selection, callbacks, direct tools, and sandbox controls: `configuring-sessions.md`
- Custom connection UI: `manually-authenticating.md`
- Triggers and webhooks: `triggers.md` and the setting-up-triggers guides
- Custom MCP servers, tools, toolkits, or proxy execution: the `extending-sessions` guides
- Legacy direct execution, MCP servers, or Tool Router migrations: the migration and sessions guides
- White labeling and custom OAuth apps: `white-labeling-authentication.md`

"Tool Router" is the former name for sessions. Treat direct execution as a migration path, not the default for new agent integrations.

## Verify setup when relevant

For a first-time setup or integration request, success means a programmatic, safe, preferably read-only tool call from the developer's real execution path returns a successful provider response and a non-empty Composio log ID. A valid empty collection from a read or list call is still a real response; an error, missing response, mock, or discovery result is not. In a dashboard handoff, report the real-call proof and any safe response-level project attribution immediately, but treat the onboarding flow as complete only after the project-scoped dashboard activation observer confirms it.

Ask which integration the developer wants to try unless the application already makes the choice clear. Prefer a bounded identity, list, or read operation that cannot send, publish, delete, purchase, or change provider state. Discover the real toolkit and tool at runtime. If the current user is not connected, follow `pending_connection`, wait for authorization, and retry.

A mock, Playground run, tool search, schema fetch, session creation, or Connect Link alone does not prove the integration. If the repository has no runnable agent loop, add only the smallest entrypoint compatible with its existing provider; do not require another hosted model.

After success, report the code location, identity and session mapping, integration and tool, safe result summary, log ID, and useful dashboard destinations. Never include credential values or raw authorization URLs. For an explanation, migration plan, or narrow bug fix, use that task's own completion condition instead of forcing a new tool call.

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
