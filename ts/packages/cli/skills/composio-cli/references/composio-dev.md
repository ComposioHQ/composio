# Composio Dev

Load this file only when the user explicitly needs developer-project workflows. Do not lead with `composio dev` for ordinary top-level CLI usage.

## Use `dev init` To Bind A Directory

Use `composio dev init` when the user wants to attach the current directory to a developer project.

```bash
composio dev init -y --no-browser
```

If later commands complain about missing developer project context, come back to `dev init`.

## Inspect Toolkits And Versions

Use toolkit commands to inspect developer-scoped capabilities:

```bash
composio dev toolkits list
composio dev toolkits info github
composio dev toolkits search "email"
composio dev toolkits version github
```

## Manage Auth Configs

Use auth-config commands when the user is configuring developer-project authentication behavior:

```bash
composio dev auth-configs list
```

## Manage Connected Accounts

Use developer connected-account commands when the user is working with developer-project users or auth-config-specific flows.

```bash
composio dev connected-accounts list
```

Top-level `composio link` is consumer-only. Use `dev connected-accounts link` for developer-project flows.

## Work With Triggers

Use trigger commands when the user is creating, inspecting, or listening to developer-project triggers.

```bash
composio dev triggers list
composio dev triggers info AGENT_MAIL_NEW_EMAIL_TRIGGER
```

## Inspect Logs

Use logs when the user is debugging tool executions or trigger deliveries inside a developer project.

```bash
composio dev logs tools
composio dev logs triggers
```

## Switch Or Inspect Org And Project Context

Use these commands when the user needs to confirm or change the active developer scope:

```bash
composio dev orgs list
composio dev projects list
```

If the user only wants to connect and execute tools as an end user, return to the top-level workflow instead of staying in `composio dev`.
