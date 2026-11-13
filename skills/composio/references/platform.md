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

If `COMPOSIO_API_KEY` already exists, or the developer arrived from Dashboard Getting Started with a project key, use that credential from the repository's existing environment or secret mechanism.

In this path:

- Never run `composio dev init` or select another project.
- Never create, rotate, replace, print, echo, log, or request the key in chat.
- Check only whether the environment variable exists and is not visibly masked or placeholder-like.
- When it lives in a file, check that the file is ignored by source control without printing the matching line.
- Let the first SDK request validate the credential; length is not validation.

If the dashboard handoff is missing or masked, direct the developer back to the same project's credential source. Do not silently switch to a provisioning flow.

### General first-time setup

If there is no existing project credential and no dashboard handoff, read the [quickstart](https://docs.composio.dev/docs/quickstart.md) and [CLI guide](https://docs.composio.dev/docs/cli.md) for current installation and authentication steps. If no human is available to log in, follow [unattended authentication](https://docs.composio.dev/docs/agent-setup/unattended-authentication.md).

Use the documented credential source and the project's existing secret-loading mechanism. Check which environment file the application actually loads rather than assuming CLI authentication configures the application.

### Install the SDK the codebase needs

Read [SDK installation and session setup](https://docs.composio.dev/docs/how-composio-works.md) for the current packages and runtime requirements. Use the codebase's existing package manager.

Add a provider adapter only when the existing framework needs one. Read the [provider index](https://docs.composio.dev/docs/providers.md) before naming a package.

Do not introduce another LLM framework solely to demonstrate Composio.

## Integrate sessions

A session is the runtime context for one application user. It carries identity, connections, tool scope, and sandbox configuration.

Trace the application's existing authenticated user or tenant ID and use that stable identifier. Do not add a parallel user system or share one placeholder identity across users.

Follow [Create a session](https://docs.composio.dev/docs/how-composio-works.md) for client initialization, creation, and tool retrieval. Copy the documented shape for the project's language rather than translating identifiers between SDKs. Keep credentials in the project's secret-loading mechanism.

For a multi-turn conversation, persist the returned session ID and resume it instead of creating a fresh session on every message. Use the [Session API lookup](#look-up-the-session-api) below for exact method names and configuration shapes.

Pass the session tools to the repository's existing model or agent using its native tool integration. Preserve the current prompt, model, streaming, and request lifecycle unless tools require a targeted change.

### Look up the Session API

Fetch the relevant Markdown page directly when you need an exact signature, option shape, or return type. Search-result summaries can omit code:

- [TypeScript creation and reuse](https://docs.composio.dev/reference/sdk-reference/typescript/sessions.md)
- [TypeScript Session methods and results](https://docs.composio.dev/reference/sdk-reference/typescript/session.md)
- [Python Session methods and results](https://docs.composio.dev/reference/sdk-reference/python/session.md)
- [Create options and configuration updates in both languages](https://docs.composio.dev/docs/configuring-sessions.md)

Check the installed SDK version first. Prefer its bundled reference for that version when it differs from the current website. API discovery does not require constructing a client, providing an API key, or calling the backend. Follow the installed type definitions rather than guessing a renamed import.

## Choose tools and authentication behavior

For Instant Tools, read the [current guide](https://docs.composio.dev/docs/instant-tools.md) before choosing authentication or usage settings. Use it for eligibility, pricing, project access, session controls, account routing, and charge reporting.

Use the [meta-tool reference](https://docs.composio.dev/toolkits/meta-tools.md) and the session's returned tool schemas for the current discovery, connection, and execution tools. Do not copy a fixed tool inventory into integration code.

Keep connection management enabled for interactive agents. It returns a Connect Link when a user needs to authorize an app; do not build a provider OAuth flow.

Before you restrict a session, check whether the request names a toolkit. A capability request such as "send an email" doesn't name Gmail, Outlook, or any other toolkit. Keep discovery available so the agent can find the toolkit and tool. Restrict the session only when the user, the application's configuration, or the inspected code names the toolkit. Then enable only that toolkit and keep discovery available.

For a narrow, deterministic agent with a fixed allowlist, consult [session configuration](https://docs.composio.dev/docs/configuring-sessions.md) before choosing the direct-tools preset. Check its current discovery, connection-management, and sandbox behavior before implementing it.

If the application has its own connect UI, use session authorization and connection-state methods and suppress in-chat connection prompts. Use managed auth initially. Create a custom auth config only for the application's OAuth branding, additional scopes, dedicated provider quotas, or self-hosted or regional requirements.

## Handle advanced product work

Do not force advanced requests through first-time setup. Route them to current documentation:

- Session scoping, account selection, callbacks, direct tools, and sandbox controls: [Configure sessions](https://docs.composio.dev/docs/configuring-sessions.md)
- Asking the user before a tool runs: [Approvals](https://docs.composio.dev/docs/governance/approvals.md)
- Blocking tool calls, tool results, or prompt injection: [Firewall](https://docs.composio.dev/docs/firewall.md)
- Adding a remote MCP server as a toolkit: [Custom MCP](https://docs.composio.dev/docs/extending-sessions/custom-mcp.md)
- Custom tools and toolkits that run in the application: [Local tools and toolkits](https://docs.composio.dev/docs/extending-sessions/local-tools-and-toolkits.md)
- Authenticated API requests through a connection: [Proxy execution](https://docs.composio.dev/docs/extending-sessions/proxy-execute.md)
- Custom connection UI: [Manual authentication](https://docs.composio.dev/docs/authentication/manually-authenticating.md)
- Triggers and webhooks: [Triggers](https://docs.composio.dev/docs/triggers.md)
- Legacy integrations: [Direct execution migration](https://docs.composio.dev/docs/migration-guide/direct-to-sessions.md) or [MCP server migration](https://docs.composio.dev/docs/migration-guide/mcp-servers-to-sessions.md)
- White labeling and custom OAuth apps: [Authentication branding](https://docs.composio.dev/docs/authentication/white-labeling-authentication.md)

"Tool Router" is the former name for sessions. Treat direct execution as a migration path, not the default for new agent integrations.

Fetch the feature's current page before writing code. Check its availability and SDK requirements, then copy the documented call shape for the requested language. Add it only when the request or inspected code asks for that control. A request like "ask before sending", "confirm before writes", or "human in the loop" asks for Approvals. A request like "never let the agent email pricing" or "stop prompt injection" asks for Firewall.

### Require approval before tools run

Read [Approvals](https://docs.composio.dev/docs/governance/approvals.md) for tool selection, input requests, continuation handling, MCP support, and current limitations.

Identify which actions require approval and how the application's existing tool loop presents questions. Wait for the user's answer before resuming a gated call. Preserve decline and cancel responses. Check the guide's provider and sandbox limitations before promising that every execution path requires approval. Only suggest running without approval when the developer explicitly accepts that behavior.

### Block calls and results with Firewall

Read [Firewall](https://docs.composio.dev/docs/firewall.md) for hook configuration, result handling, update behavior, execution coverage, and availability.

Identify whether the policy must block a call or a result. Describe the condition to block, then use the documented configuration for the project's language. Treat a policy block as a policy outcome. Do not reconnect an account or retry an unchanged call to bypass it. Review the current coverage and update semantics before modifying an existing policy.

### Add a remote MCP server

Read [Custom MCP](https://docs.composio.dev/docs/extending-sessions/custom-mcp.md) for creation, authentication, sharing scope, synchronization, supported transports, and limits. For functions that run inside the application, consult [local tools and toolkits](https://docs.composio.dev/docs/extending-sessions/local-tools-and-toolkits.md) instead.

Choose the intended user scope before creating a toolkit. Keep secrets out of its URL, use the returned identifier, and follow the documented authentication and synchronization procedure. Check the current mutation limits before changing an existing toolkit or proposing deletion and recreation.

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
