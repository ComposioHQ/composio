---
type: "guide"
title: "Create Read-Only and Restricted Composio Sessions"
description: "Public guidance for limiting session tool access with tags, exact tool allowlists, OAuth scopes, and sandbox controls."
category: "authentication"
visibility: "public"
timestamp: "2026-08-24T00:00:00Z"
tags:
  - "read-only"
  - "tool-policy"
  - "least-privilege"
  - "oauth-scopes"
  - "sessions"
---
# Create Read-Only and Restricted Composio Sessions

## Filter a broad read-only session with behavior tags

Use session-level behavior tags when the agent may discover tools across
multiple toolkits but should only receive tools marked as read-only. The same
filters are enforced when the session executes tools.

**Python**

```python
session = composio.sessions.create(
    user_id="user_123",
    tags={
        "enable": ["readOnlyHint"],
        "disable": ["destructiveHint"],
    },
)
```

**TypeScript**

```typescript
const session = await composio.create("user_123", {
  tags: {
    enable: ["readOnlyHint"],
    disable: ["destructiveHint"],
  },
});
```

Behavior tags describe tool behavior. Inspect the tools the session exposes
before rollout, especially when a workflow handles sensitive data.

- [Filter tools by tags](https://docs.composio.dev/docs/configuring-sessions#filtering-tools-by-tags)

## Use exact tool allowlists for the narrowest policy

For a workflow with a known set of operations, allow only the exact tool slugs
it requires. An allowlist avoids admitting a newly added tool merely because it
shares a toolkit or behavior tag.

**Python**

```python
session = composio.sessions.create(
    user_id="user_123",
    tools={
        "gmail": {"enable": ["GMAIL_FETCH_EMAILS"]},
        "github": {"enable": ["GITHUB_GET_AN_ISSUE"]},
    },
)
```

**TypeScript**

```typescript
const session = await composio.create("user_123", {
  tools: {
    gmail: { enable: ["GMAIL_FETCH_EMAILS"] },
    github: { enable: ["GITHUB_GET_AN_ISSUE"] },
  },
});
```

- [Enable and disable specific tools](https://docs.composio.dev/docs/configuring-sessions#enabling-or-disabling-specific-tools)

## Combine provider scopes with session tool restrictions

OAuth scopes control what the provider grants to a connected account. Session
filters control which Composio tools the agent can discover and execute. Use
both layers for least privilege: request only the provider scopes the use case
needs, then restrict the session to the intended tools.

Changing an auth config's scopes affects new connections only. Existing users
keep their prior grants until they reconnect. Pass the intended auth config ID
to the session, keyed by toolkit, or the session will not request those scopes.

- [Control OAuth scopes](https://docs.composio.dev/docs/authentication/controlling-scopes)
- [Select an auth config in a session](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app#create-a-custom-auth-config)

## Apply toolkit-specific exceptions without widening every toolkit

Set a global tag policy and override it only for a named toolkit. This is safer
than relaxing the global policy for the entire session.

**Python**

```python
session = composio.sessions.create(
    user_id="user_123",
    tags=["readOnlyHint"],
    tools={
        "github": {"tags": {"disable": ["destructiveHint"]}},
        "gmail": {"tags": ["readOnlyHint"]},
    },
)
```

**TypeScript**

```typescript
const session = await composio.create("user_123", {
  tags: ["readOnlyHint"],
  tools: {
    github: { tags: { disable: ["destructiveHint"] } },
    gmail: { tags: ["readOnlyHint"] },
  },
});
```

- [Toolkit-specific tag filters](https://docs.composio.dev/docs/configuring-sessions#filtering-tools-by-tags)

## Disable the session sandbox when the workflow does not need code execution

Session tool filters govern app tools. Sessions also include remote sandbox
tools by default. Disable the sandbox for a tightly constrained workflow that
does not need Python, shell, file processing, or remote workbench execution.

**Python**

```python
session = composio.sessions.create(
    user_id="user_123",
    tags=["readOnlyHint"],
    sandbox={"enable": False},
)
```

**TypeScript**

```typescript
const session = await composio.create("user_123", {
  tags: ["readOnlyHint"],
  sandbox: { enable: false },
});
```

- [Disable the session sandbox](https://docs.composio.dev/docs/configuring-sessions#disabling-the-sandbox)
