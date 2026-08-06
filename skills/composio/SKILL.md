---
name: composio
description: Use when the user mentions Composio, wants to add Composio to an agent or codebase, wants an AI agent to act in real apps such as Gmail, Slack, GitHub, Notion, Calendar, or Linear, or needs help fixing a Composio setup, connection, or tool call.
---

# Composio

Composio gives AI agents tools and authenticated access to external apps.

There are two products. They have different URLs, keys, and setup paths. Decide which one applies before doing anything else, and do not blend them.

| | Composio For You | Composio Platform |
|---|---|---|
| For | You want your agent to use your apps | You are building a product where your users connect their accounts |
| Surface | An MCP server attached to an AI client | An SDK integrated into a codebase |
| Key | `ck_...` consumer key | `COMPOSIO_API_KEY` project key |
| Dashboard | `dashboard.composio.dev` → For You | `dashboard.composio.dev` → Platform |

## First decide the product

Ask one question when the answer is not already clear:

> Are you setting Composio up for yourself so your coding agent can use your apps, or are you building a product where your own users connect their accounts?

Skip the question when context is sufficient:

- The user names an AI client and is not building code → For You.
- The user is inside a codebase or mentions users, tenants, `user_id`, an SDK, or an agent they are building → Platform.

Read exactly one product guide. Do not read both.

### 1. Composio For You

Read [Composio For You](references/for-you.md).

### 2. Composio Platform

Read [Composio Platform](references/platform.md).

### 3. Errors and provider failures

For provider- and toolkit-level failures shared by both products, read [Errors and provider gotchas](references/errors.md).

## Finish the work

Install the dependency, write the configuration, and run the command. Setup is not complete until one real tool call succeeds.

## Stable rules

1. Establish which product applies before setup.
2. Never invent a toolkit or tool slug. For Platform sessions, use `COMPOSIO_SEARCH_TOOLS`; for direct CLI work, use `composio search` and inspect with `composio execute --get-schema`.
3. Do not build an OAuth flow. Composio supplies a Connect Link when authentication is required.
4. Use sessions for new Platform integrations. Direct execution is a legacy migration path.
5. Keep credentials in environment variables and out of source control.
6. Get the log ID before diagnosing a failed tool call.

## Fresh information

When a detail is not covered by the selected guide, fetch the current markdown documentation and complete the work from it:

```text
https://docs.composio.dev/docs/<page>.md
https://docs.composio.dev/llms.txt
https://docs.composio.dev/toolkits/<toolkit>.md
```
