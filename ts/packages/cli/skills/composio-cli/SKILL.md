---
name: composio-cli
description: Help users operate the published Composio CLI to find the right tool, connect accounts, inspect schemas, execute tools, subscribe to trigger events with `composio listen`, script workflows with `composio run`, and call authenticated app APIs with `composio proxy`. Use when the user asks how to do something with `composio`, wants to run a known tool slug, needs to discover a slug with `composio search`, fix a missing connection with `composio link`, inspect tool inputs with `--get-schema` or `--dry-run`, troubleshoot top-level CLI flows, or explicitly needs `composio dev` guidance.
---

<!-- AUTO-GENERATED: edit skills-src/composio-cli/index.ts and rebuild -->
<!-- release-channel: stable -->

# Composio CLI

## Default Workflow

1. Start with `composio execute <slug>` whenever the slug is known.
2. If several independent tool calls must happen at once, use `composio execute -p/--parallel` with repeated `<slug> -d <json>` groups.
3. If `execute` says the toolkit is not connected, run `composio link <toolkit>` and retry.
4. If the arguments are unclear, run `composio execute <slug> --get-schema` or `--dry-run` before guessing.
5. Reach for `composio search "<task>"` only when the slug is unknown. `search` accepts one or more queries, so batch related discovery work into a single command when useful.

## `execute` - Run A Tool

Use `execute` when the tool slug is already known.

```bash
composio execute GITHUB_GET_THE_AUTHENTICATED_USER -d '{}'
```

Inspect required inputs without executing:

```bash
composio execute GITHUB_CREATE_AN_ISSUE --get-schema
```

Preview safely:

```bash
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'
```

Pass data from a file or stdin:

```bash
composio execute GITHUB_CREATE_AN_ISSUE -d @issue.json
cat issue.json | composio execute GITHUB_CREATE_AN_ISSUE -d -
```

Upload a local file:

```bash
composio execute SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK \
  --file ./image.png \
  -d '{ channels: "C123" }'
```

Run independent tool calls in parallel:

```bash
composio execute --parallel \
  GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", subject: "Hi" }' \
  GITHUB_CREATE_AN_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug" }'
```

Key flags:

- `--get-schema`: Inspect required arguments without executing the tool.
- `--dry-run`: Preview the request shape without performing the action.
- `--file`: Inject a local file path into a tool that exposes exactly one uploadable file argument.
- `--parallel`: Execute multiple independent tool calls in the same invocation.

- `--file` only works when the tool exposes a single uploadable file input. Otherwise use explicit `-d` JSON.

## `search` - Find The Slug

Use `search` only when the tool slug is not already known.

```bash
composio search "create a github issue"
composio search "send an email" --toolkits gmail
composio search "send an email" "create a github issue"
composio search "my emails" "my github issues" --toolkits gmail,github
```

- Batch related discovery work into one `search` invocation, then move back to `execute` once the correct slugs are known.

## `link` - Connect An Account

Use `link` when `execute` reports that a toolkit is not connected, or when the user explicitly wants to authorize an account.

```bash
composio link gmail
composio link googlecalendar --no-browser
```

- Retry the original `execute` command after linking succeeds.

## `listen` - Subscribe To Trigger Events

Use `listen` for temporary trigger subscriptions in consumer projects, especially when background agents should consume new event payloads from artifact files.

```bash
composio listen GMAIL_NEW_GMAIL_MESSAGE
composio listen SLACK_RECEIVE_MESSAGE -p '{ trigger_config: { channel: "C123" } }'
composio listen GMAIL_NEW_GMAIL_MESSAGE --stream
composio listen GMAIL_NEW_GMAIL_MESSAGE --stream '.data.threadId'
composio listen GMAIL_NEW_GMAIL_MESSAGE --timeout 5m
composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --max-events 5
```

Key flags:

- `-p/--params`: Provide only trigger config fields; connected account resolution is automatic.
- `--stream`: Print events inline, optionally narrowed to a JSON path.
- `--timeout` and `--max-events`: Stop long-running listeners cleanly.

- `composio artifacts cwd` shows the current artifact root when saved payloads need inspection.

## `proxy` - Raw API Access

Use `proxy` when a toolkit supports a raw API operation that is easier than finding a dedicated tool slug.

```bash
composio proxy https://api.github.com/user --toolkit github --method GET </dev/null
```

## `run` - Scripting, LLMs, and Programmatic Workflows

For programmatic calls, loops, output plumbing, or anything beyond a single tool call, prefer `composio run`.

`composio run` executes an inline ESM JavaScript/TypeScript snippet with authenticated `execute()`, `search()`, `proxy()`, and the experimental `experimental_subAgent()` helper pre-injected. No SDK setup required.

Chain multiple tools:

```bash
composio run '
  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");
  const emails = await execute("GMAIL_FETCH_EMAILS", { max_results: 1 });
  console.log({ login: me.data.login, fetchedEmails: !!emails.data });
'
```

Fan out with Promise.all:

```bash
composio run '
  const [me, emails] = await Promise.all([
    execute("GITHUB_GET_THE_AUTHENTICATED_USER"),
    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),
  ]);
  console.log({ login: me.data.login, emailCount: emails.data.messages?.length });
'
```

- Use top-level `execute --parallel` instead when the user only needs a few independent tool calls and does not need script logic.

### Stable Path

Stable releases should stick to fully-supported `execute()`, `search()`, and `proxy()` flows unless the user explicitly asks for experimental guidance.

## Auth

```bash
composio whoami   # check current session
composio login    # authenticate if whoami fails
```

## Escalate Only When Needed

If the user is stuck on top-level commands or needs fallback inspection commands, load [references/troubleshooting.md](references/troubleshooting.md).

If the user explicitly asks about developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects, load [references/composio-dev.md](references/composio-dev.md). `composio dev` is not the default end-user path.
