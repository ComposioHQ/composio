---
name: composio-cli
description: Help users operate the published Composio CLI to find the right tool, connect accounts, inspect schemas, execute tools, script workflows with `composio run`, and call authenticated app APIs with `composio proxy`. Use when the user asks how to do something with `composio`, wants to run a known tool slug, needs to discover a slug with `composio search`, fix a missing connection with `composio link`, inspect tool inputs with `--get-schema` or `--dry-run`, troubleshoot top-level CLI flows, or explicitly needs `composio dev` guidance.
---

# Composio CLI

Use the shortest loop that gets the job done: `execute` first, `search` when the slug is unknown, `link` when a connection is missing, then retry `execute`.

## Use The Default Workflow

1. Start with `composio execute <slug>` whenever the slug is known.
2. Let `execute` do the work. It already validates inputs and checks connection state.
3. If `execute` says the toolkit is not connected, run `composio link <toolkit>` and retry.
4. If the arguments are unclear, run `composio execute <slug> --get-schema` or `--dry-run` before guessing.
5. Reach for `composio search "<task>"` only when the slug is unknown.

## Treat Auth As A Footnote

Use auth checks as quick preflight, not as the main workflow.

```bash
composio whoami
```

If `composio whoami` fails, run `composio login` and then move straight back to `execute`.

## Use `execute` First

Run a known slug:

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
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d @issue.json
cat issue.json | composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d -
```

Recover from missing connections:

```bash
composio execute GMAIL_FETCH_EMAILS -d '{ max_results: 1 }'
composio link gmail --no-browser
```

After the auth flow completes, rerun the original `execute` command.

Prefer `composio tools info` and `composio tools list` only when `search`, `--get-schema`, or the error message still leave the user stuck.

## Use `search` To Find The Slug

When the user knows the task but not the tool name, search first and then execute the best match.

```bash
composio search "create a github issue"
composio search "send an email" --toolkits gmail
```

Read the returned slugs, choose the best match, and immediately move back to `execute`.

## Use `link` Only To Unblock `execute`

Use `link` when `execute` reports that the toolkit is not connected, or when the user explicitly wants to authorize an account.

```bash
composio link gmail
composio link googlecalendar --no-browser
```

After linking, retry the original `execute` command instead of changing strategies.

## Use Power Tools Deliberately

Use `composio run` when one tool call is not enough and the user needs chaining, batching, lightweight automation, or sub-agent orchestration.

```bash
composio run '
  const [me, emails] = await Promise.all([
    execute("GITHUB_GET_THE_AUTHENTICATED_USER"),
    execute("GMAIL_FETCH_EMAILS", { max_results: 1 }),
  ]);

  console.log({
    login: me.data.login,
    fetchedEmails: !!emails.data,
  });
'
```

Use `composio proxy` when the toolkit supports a raw API operation that is easier than finding a dedicated tool.

```bash
composio proxy https://api.github.com/user --toolkit github --method GET </dev/null
```

For richer `run`, `subAgent()`, `result.prompt()`, `Promise.all`, and mixed `execute()` plus `proxy()` patterns, load [references/power-user-examples.md](references/power-user-examples.md).

## Escalate Only When Needed

If the user is stuck on top-level commands or needs fallback inspection commands, load [references/troubleshooting.md](references/troubleshooting.md).

If the user explicitly asks about developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects, load [references/composio-dev.md](references/composio-dev.md). `composio dev` is not the default end-user path.
