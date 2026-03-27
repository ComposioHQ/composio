# Troubleshooting

Load this file when the user is stuck on top-level Composio CLI flows.

## Not Logged In

Symptoms:

- `composio` commands fail because there is no user session
- the user is unsure which account the CLI is using

Fix:

```bash
composio whoami
```

If `composio whoami` fails, run `composio login` and then return to the original `execute` or `search` flow.

## No Active Connection Found

Symptoms:

- `execute` reports that no active connection exists for a toolkit

Fix:

```bash
composio link gmail --no-browser --no-wait
composio link googlecalendar --no-browser --no-wait
```

After linking, retry the exact same `execute` command.

## Invalid JSON Input

Symptoms:

- `execute` rejects `-d` input
- the payload is not valid JSON or JS-style object syntax

Fix:

- Pass JSON or a JS-style object literal to `-d`
- Use `@file` for large payloads
- Use `-` to read from stdin

Examples:

```bash
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{"owner":"acme","repo":"app","title":"Bug report","body":"Steps to reproduce..."}'
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d @payload.json
cat payload.json | composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d -
```

## Unknown Or Wrong Slug

Symptoms:

- the user does not know the tool slug
- the slug exists but is not the right tool for the job

Fix:

```bash
composio search "create a github issue"
composio search "send an email" --toolkits gmail
composio search "send an email" "create a github issue"
```

Use multiple queries in one `search` call when the user is exploring several related tasks at once. Use `composio tools list <toolkit>` only when the user already knows the toolkit and needs to browse the available slugs manually.

## Confusion About Required Inputs

Symptoms:

- the user is unsure what fields a tool accepts
- the first payload attempt failed validation

Fix:

```bash
composio execute GITHUB_CREATE_AN_ISSUE --get-schema -d '{}'
composio execute GITHUB_CREATE_AN_ISSUE --skip-connection-check --dry-run -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'
```

Use `composio tools info <slug>` only when the user wants a compact summary of a known slug and the `execute --get-schema` output is still not enough.

## Several Independent Tool Calls

Symptoms:

- the user wants to run multiple unrelated tools in one step
- the user is about to write a script only to execute a few independent calls

Fix:

```bash
composio execute --parallel \
  GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", subject: "Hi" }' \
  GITHUB_CREATE_AN_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug" }'
```

Escalate to `composio run` only when the user needs control flow, loops, `Promise.all`, `search()` inside a script, `proxy()`, or `subAgent()`.

## `tools info` And `tools list` Are Fallbacks

Treat these commands as secondary inspection tools:

```bash
composio tools info GMAIL_SEND_EMAIL
composio tools list gmail
```

Do not lead with them when `execute`, `search`, `--get-schema`, or `--dry-run` can get the user unstuck faster.

## Consumer Vs `composio dev`

Use the top-level commands for normal end-user flows:

- `composio execute`
- `composio search`
- `composio link`
- `composio run`
- `composio proxy`

Load [composio-dev.md](composio-dev.md) only when the user explicitly needs developer projects, auth configs, connected accounts, triggers, logs, orgs, or projects.
