## Why can QuickBooks OAuth show Cloudflare Error 1016 (Origin DNS error)?

If this appears while connecting QuickBooks and the auth config includes the `com.intuit.quickbooks.payment` scope, check whether the QuickBooks Payments module is enabled for the selected QuickBooks company.

That scope requires payment-module access in QuickBooks. If you do not need payment tools, remove `com.intuit.quickbooks.payment` from the auth config and reconnect. If you do need payment tools, enable QuickBooks Payments for that company/account, then start a fresh connection.

## Why can Claude block QuickBooks in consumer MCP sessions?

This behavior is intentional on Claude's side. QuickBooks has tools that can process payments, so Claude can classify it under Payment Processing and block execution in consumer MCP sessions. Use Claude Code or Claude Cowork with Composio through the CLI/developer path where the agent can still access QuickBooks through Composio.

## When should I use the sandbox QuickBooks API base URL for sandbox connections?

For QuickBooks sandbox accounts, pass `https://sandbox-quickbooks.api.intuit.com` as the URL/base URL when initiating the connection. Production connections should use the production Intuit API base URL.
