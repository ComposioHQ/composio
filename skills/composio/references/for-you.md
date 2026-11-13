# Composio For You

Use this product when someone wants their own AI client or terminal agent to use their own connected apps. Route by task: answer a question, configure an MCP client, operate through the CLI, connect an app, or debug an existing setup.

## Look up connection details

Read [Composio Connect](https://docs.composio.dev/docs/composio-connect.md) for the current MCP endpoint, client authentication, headers, and credential location. Use the documented For You credential for the selected client. Do not substitute a Platform project key or endpoint.

## Choose MCP or CLI

Default to MCP for desktop and hosted AI clients. Use the CLI for terminal agents that can execute commands and operate tools directly.

### Inspect what is installed

Check which tools, skills, plugins, and CLI commands the agent can actually access. Do not assume that installing one makes the others available. Use the [agent plugin guide](https://docs.composio.dev/docs/agent-plugins.md), [public skill guide](https://docs.composio.dev/docs/using-composio-skill.md), and [CLI guide](https://docs.composio.dev/docs/cli.md) for current installation and routing details.

### MCP clients

Before giving client-specific steps, read the selected client's section in [Composio Connect](https://docs.composio.dev/docs/composio-connect.md). Follow its current transport and authentication instructions.

Keep current documentation and CLI or tool schemas as the primary sources. If they do not answer a For You support question, query `https://docs.composio.dev/api/knowledge-search?q=<question>`. Results may be canonical docs, KB, toolkit, example, or reference pages. Use the returned evidence; do not infer the live state of a user's account, connection, or tool call from public records.

For another MCP-capable client, check its supported transport and authentication against that guide before configuring it. Keep credentials out of committed configuration.

### Terminal agents

Install and authenticate the CLI only when the task needs it. Read the [CLI guide](https://docs.composio.dev/docs/cli.md) for current commands, flags, authentication, and tool discovery. For unattended setup, read [unattended authentication](https://docs.composio.dev/docs/agent-setup/unattended-authentication.md) before choosing a login flow.

Discover the tool for the requested task, inspect its schema, connect only the required app, and execute with the documented inputs. Once installed, consult the CLI's bundled guidance and command help rather than copying examples from an older skill.

## Connect apps when the task needs them

Do not pre-connect every app. Start the requested task. When an integration is required, Composio returns an authorization link and the connection persists for future runs.

For setup or an operational request, verify the selected path with one safe real call when authorization is available. For a question or configuration explanation, answer it without forcing execution.

## Debugging

First confirm that the client is connected to the correct MCP endpoint or that the CLI is authenticated. Then get the Composio log or request ID and read [Errors and provider gotchas](errors.md).

Common product-specific checks:

- If MCP tools do not appear, confirm the connector is enabled, clear its cache when the client supports that, and reconnect it.
- If browser OAuth repeatedly selects the wrong account, retry in a clean browser profile with one Composio account signed in.
- If an authorization link expired, request a new link rather than reusing it.
- If a connected app action returns an auth error, reconnect that app and retry without regenerating the client credential.

For connection and credential management, use the current destinations in [Composio Connect](https://docs.composio.dev/docs/composio-connect.md).
