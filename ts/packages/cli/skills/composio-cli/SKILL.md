---
name: composio-cli
description: Help users operate the published Composio CLI to find the right tool, connect accounts, inspect schemas, execute tools, subscribe to trigger events with `composio listen`, script workflows with `composio run`, and call authenticated app APIs with `composio proxy`. Use when the user asks how to do something with `composio`, wants to run a known tool slug, needs to discover a slug with `composio search`, fix a missing connection with `composio link`, inspect tool inputs with `--get-schema` or `--dry-run`, troubleshoot top-level CLI flows, or explicitly needs `composio dev` guidance.
---

# Composio CLI

## Default Workflow

1. Start with `composio execute <slug>` whenever the slug is known.
2. If several independent tool calls must happen at once, use `composio execute -p/--parallel` with repeated `<slug> -d <json>` groups.
3. If `execute` says the toolkit is not connected, run `composio link <toolkit>` and retry.
4. If the arguments are unclear, run `composio execute <slug> --get-schema` or `--dry-run` before guessing.
5. Reach for `composio search "<task>"` only when the slug is unknown. `search` accepts one or more queries, so batch related discovery work into a single command when useful.

## `execute` — Run A Tool

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

Upload a local file when the tool has a single `file_uploadable` input:

```bash
composio execute SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK \
  --file ./image.png \
  -d '{ channels: "C123" }'
```

`--file` injects the local path into the tool's single uploadable file field. If a tool has no uploadable file input, or has more than one, use explicit `-d` JSON instead.

Run independent tool calls in parallel:

```bash
composio execute --parallel \
  GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", subject: "Hi" }' \
  GITHUB_CREATE_AN_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug" }'
```

## `search` — Find The Slug

```bash
composio search "create a github issue"
composio search "send an email" --toolkits gmail
composio search "send an email" "create a github issue"
composio search "my emails" "my github issues" --toolkits gmail,github
```

Use multiple quoted queries when the user is exploring more than one task or a small cross-app workflow. Read the returned slugs, choose the best match, and move back to `execute`.

## `link` — Connect An Account

Use `link` when `execute` reports the toolkit is not connected, or the user wants to authorize an account.

```bash
composio link gmail
composio link googlecalendar --no-browser
```

After linking, retry the original `execute` command.

## `listen` — Subscribe To Trigger Events

Use `composio listen` when the user wants a temporary subscription for consumer-project events, especially for background agents that should consume new emails, Slack messages, or similar trigger payloads from artifact files.

The command creates a temporary trigger, subscribes to it, writes each event to the artifact folder, and disables the trigger on cleanup.

```bash
composio listen GMAIL_NEW_GMAIL_MESSAGE
composio listen SLACK_RECEIVE_MESSAGE -p '{ trigger_config: { channel: "C123" } }'
composio listen GMAIL_NEW_GMAIL_MESSAGE --stream
composio listen GMAIL_NEW_GMAIL_MESSAGE --stream '.data.threadId'
composio listen GMAIL_NEW_GMAIL_MESSAGE --timeout 5m
composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --max-events 5
```

Key points:

- `-p/--params` is only for trigger config fields; the connected account is resolved automatically.
- `--stream` prints each event inline, and `--stream '.path.here'` prints only the selected field.
- `--timeout` and `--max-events` are the normal ways to stop long-running listeners cleanly.
- `composio artifacts cwd` shows the current artifact root when the user needs to inspect saved event payloads.

## `proxy` — Raw API Access

Use `composio proxy` when the toolkit supports a raw API operation that is easier than finding a dedicated tool.

```bash
composio proxy https://api.github.com/user --toolkit github --method GET </dev/null
```

## `run` — Scripting, LLMs, and Programmatic Workflows

> **For programmatic calls, LLM workflows, or anything beyond a single tool call — use `composio run`.**

`composio run` executes an inline ESM JavaScript/Typescript (bun compatible) snippet with authenticated `execute()`, `search()`, `proxy()`, and the experimental `experimental_subAgent()` helper pre-injected. No SDK setup required.

Chain multiple tools:

```bash
composio run '
  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");
  const emails = await execute("GMAIL_FETCH_EMAILS", { max_results: 1 });
  console.log({ login: me.data.login, fetchedEmails: !!emails.data });
'
```

Use top-level `execute --parallel` when the user just needs a few independent tool calls and does not need script logic, loops, or output plumbing.

Fan out with `Promise.all`:

```bash
composio run '
  const [me, emails] = await Promise.all([
    execute("GITHUB_GET_THE_AUTHENTICATED_USER"),
    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),
  ]);
  console.log({ login: me.data.login, emailCount: emails.data.messages?.length });
'
```

Feed tool output into an LLM and get structured JSON back:

```bash
composio run --logs-off '
  const emails = await execute("GMAIL_FETCH_EMAILS", { max_results: 5 });
  const brief = await experimental_subAgent(
    `Summarize these emails and count them.\n\n${emails.prompt()}`,
    { schema: z.object({ summary: z.string(), count: z.number() }) }
  );
  console.log(brief.structuredOutput);
'
```

For more patterns — multi-query top-level `search`, `proxy()` inside scripts, mixed `execute()` + `proxy()`, and `--dry-run`/`--debug` flags — load [references/power-user-examples.md](references/power-user-examples.md).

## Auth

```bash
composio whoami   # check current session
composio login    # authenticate if whoami fails
```

## Escalate Only When Needed

If the user is stuck on top-level commands or needs fallback inspection commands, load [references/troubleshooting.md](references/troubleshooting.md).

If the user explicitly asks about developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects, load [references/composio-dev.md](references/composio-dev.md). `composio dev` is not the default end-user path.
