---
name: composio
description: Route and complete Composio work across Composio For You and Composio Platform. Use when the user mentions Composio; wants an agent to use apps such as Gmail, Slack, GitHub, Notion, Calendar, or Linear; needs first-time setup, an SDK or MCP integration, CLI operation, migration guidance, current documentation, or help diagnosing a connection or tool call.
---

# Composio

Use this skill as a router. Identify the product and the job, load only the relevant guidance, consult canonical documentation for volatile details, and then answer or do the work the user requested.

## 1. Choose the product

Do not blend the products. They use different credentials and setup paths.

| | Composio For You | Composio Platform |
|---|---|---|
| Use when | Someone wants their own agent to use their own apps | A developer is building a product whose users connect accounts |
| Primary surface | MCP or the Composio CLI | SDK sessions inside an application |
| Credential | `ck_...` consumer key when the client requires a header | `COMPOSIO_API_KEY` project key |
| Dashboard | `dashboard.composio.dev` → For You | `dashboard.composio.dev` → Platform |

Ask one short question only when context does not establish the product:

> Is this for your own agent and accounts, or for a product where your users connect their accounts?

Treat a named personal AI client with no product code as For You. Treat an application codebase, SDK, user or tenant identity, backend, or product agent as Platform.

## 2. Choose the job

Identify the requested outcome before taking action:

- **Explain or discover:** answer a question, compare approaches, or find the current API.
- **Set up:** establish credentials, an MCP client, the CLI, or an SDK for the first time.
- **Build or change:** integrate Composio into an existing agent or application.
- **Operate:** find, connect, and run tools for a real task.
- **Debug or migrate:** diagnose a failure, update an older integration, or move from legacy direct execution or Tool Router.

Do not turn an explanation, documentation lookup, or narrow bug fix into onboarding.

## 3. Load only the relevant guidance

- For You: read [Composio For You](references/for-you.md).
- Platform: read [Composio Platform](references/platform.md).
- Provider, connection, or execution failure: also read [Errors and provider gotchas](references/errors.md).

## Complete the selected job

- For a question, fetch current documentation when needed and give the concrete answer. Do not mutate a project or force a tool call.
- For setup or integration, inspect the existing environment, preserve its architecture and identity model, make the smallest useful change, and verify it with one safe real tool call when credentials and user authorization are available.
- For an operational request, connect only the apps the task needs and execute the requested workflow.
- For debugging, get the Composio log or request ID, identify the failing boundary, fix that boundary, and retry when the user authorized execution.

## Stable rules

1. Establish the product before choosing credentials, URLs, SDKs, or commands.
2. Treat dashboard onboarding as a context, not the skill's identity. When the developer arrives with an existing `COMPOSIO_API_KEY` from Getting Started, use it and never create, rotate, replace, print, or request it in chat. Do not run `composio dev init` in that path.
3. For a general first-time Platform setup with no dashboard credential handoff, follow the current setup path in the Platform guide.
4. Never invent toolkit or tool slugs. Discover them at runtime or with the CLI.
5. Do not build a provider OAuth flow. Composio returns a Connect Link when authentication is needed.
6. Use sessions for new Platform integrations. Preserve the application's existing user identity and agent architecture.
7. Keep credentials out of source control, URLs, logs, chat, and command output.
8. Get the log or request ID before diagnosing a failed tool call.
9. Prefer the smallest configuration that completes the current job. Keep toolkit filters, tag policies, sandbox controls, custom auth, provider-specific hardening, and other advanced options out of the first path unless the request or existing code requires them.
10. Do not invent repository facts. Never claim that a file, framework, environment loader, identity field, agent path, or dependency exists until it was provided or inspected. If codebase context is unavailable, state the unknown and ask for access or one necessary detail.

## Canonical information

Use bundled references for stable decisions. For versions, provider adapters, client-specific setup, toolkit behavior, or APIs that may have changed, fetch the current Markdown source before answering or editing code:

When sources disagree, prefer the current API reference and live endpoint behavior over any page marked Legacy, and name the REST API version explicitly.

```text
https://docs.composio.dev/llms.txt
https://docs.composio.dev/docs/<page>.md
https://docs.composio.dev/toolkits/<toolkit>.md
```

Use the documentation to complete the task. Do not merely hand the user a link unless they asked for one.
