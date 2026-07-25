QuickBooks is categorized under both Accounting and Payment Processing. When an MCP session is created with Payment Processing excluded, the session policy disables the entire [QuickBooks toolkit](/toolkits/quickbooks) — including read-only accounting and reporting tools. Execution then returns `[Session Restriction] Toolkit 'quickbooks' is disabled for this session`.

## Why the connection still looks healthy

The restriction belongs to the session, not to the connected account. The account stays active and tool schemas still load, so nothing looks wrong until a tool is executed. Reconnecting or recreating the QuickBooks connected account does not change the outcome.

## Use an execution path outside that session

The policy is evaluated when the session is created and cached for the life of that session. Creating another session under the same payment-processing exclusion produces the same restriction, so switching MCP clients does not by itself resolve it.

To reach QuickBooks tools, execute through a path that does not create the restricted session:

- the Composio SDK
- the tools execute API
- `composio execute` from the CLI

Confirm the path you pick is not creating a session with the same exclusion before relying on it.
