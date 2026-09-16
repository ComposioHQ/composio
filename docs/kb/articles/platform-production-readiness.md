## Replace example user IDs with stable application user IDs

Create sessions and connected accounts with a stable identifier from the
application database, such as a UUID or primary key. Do not use an email
address that can change, and never use `default` in production. Composio uses
the user ID to isolate connections and tool calls, so each application user
must resolve to the same Composio user ID across sessions.

- [Authentication and user IDs](https://docs.composio.dev/docs/authentication)
- [How Composio sessions work](https://docs.composio.dev/docs/how-composio-works)

## Isolate environments with separate Composio projects when needed

A Composio project scopes its API keys, connected accounts, auth configs, and
webhooks. Use separate projects for development, staging, and production when
those resources must not overlap. Use the API key for the intended project in
each deployment, and create environment-specific auth configs when the OAuth
apps, scopes, or provider credentials differ.

- [Composio glossary: Project](https://docs.composio.dev/reference/glossary#project)
- [Configure authentication](https://docs.composio.dev/docs/tools-direct/authenticating-tools)

## Switch from managed auth only when production requirements call for it

Composio managed auth is suitable for development, internal tools, and early
prototypes. Create a custom auth config when users must see the application's
own OAuth brand, the integration needs custom scopes or a dedicated provider
quota, polling requirements differ, or the provider uses a custom instance.
Pass the resulting auth config ID to the session; creating the config alone
does not make the session use it.

- [Managed vs custom auth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- [Controlling OAuth scopes](https://docs.composio.dev/docs/authentication/controlling-scopes)

## Restrict the production session to the capabilities the agent needs

Set toolkit, tool, and behavior-tag filters when creating the session. For a
sensitive or deterministic workflow, prefer an explicit allowlist of exact
tool slugs. For a broader read-only agent, filter on `readOnlyHint` and disable
`destructiveHint`, then inspect the resulting tool set before rollout.

- [Configure session tool access](https://docs.composio.dev/docs/configuring-sessions)
- [Create read-only and restricted sessions](../session-tool-policies/public.md)

## Reuse a stored session until the user or configuration changes

Store the session ID and restore it with `composio.use(session_id)` instead of
creating a new session for every turn. Create a new session for a different
user or a materially different setup, such as a new tool policy or auth-config
mapping. A session preserves its scoped runtime state, but it is not the
language model's conversation memory.

- [Reuse a session](https://docs.composio.dev/docs/how-composio-works#how-sessions-behave)

## Test production trigger handling through the real webhook path

The local `subscribe()` stream is useful for inspecting events, but it bypasses
the production webhook handler and signature verification. Before rollout,
forward events to the real local handler or use a tunnel, verify the signed
payload with `parse()`, and then register the production HTTPS webhook URL for
the production project.

- [Receive trigger events locally and in production](https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events)
