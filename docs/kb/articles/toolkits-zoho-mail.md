## ZOHO_MAIL_MESSAGES_SEND_EMAIL supports sending attachments

`ZOHO_MAIL_MESSAGES_SEND_EMAIL` supports sending attachments. If attachment support was previously missing, retry with the latest toolkit version. If attachment sending still fails, contact Composio support with the redacted tool-call details.

## Pass the correct Zoho region when connecting Zoho Mail

For Zoho Mail connection issues, verify the region passed during connection initiation. Zoho accounts can be region-specific, so an EU or other regional account may fail if the default/wrong region is used. Retry the connection with the correct Zoho region.

## Zoho Mail account_id must be handled as a string to avoid JavaScript precision loss

Treat Zoho Mail `account_id` values as strings, not integers. Zoho account IDs can exceed JavaScript's safe integer limit, and numeric coercion can silently truncate them before the tool call reaches Zoho. If you see unexpected account IDs or tool failures with long IDs, verify the schema and payload preserve `account_id` as a string.

## Connect MCP is agent-oriented; authenticate Zoho Mail in Connect dashboard before tool use

Connect MCP is intended for agent/client workflows through Tool Router, not as a raw direct API endpoint. For Zoho Mail, make sure the user has connected a Zoho Mail account in the Connect dashboard first, then use the supported MCP client flow. If the user wants direct API execution, route them to Tool Router/API or Proxy Execute patterns instead of treating Connect MCP as a raw REST proxy.
