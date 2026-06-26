## Does ZOHO_MAIL_MESSAGES_SEND_EMAIL support sending attachments?

`ZOHO_MAIL_MESSAGES_SEND_EMAIL` supports sending attachments. If a user previously saw missing attachment support, ask them to retry on the latest/current toolkit behavior and check the tool call details if attachment sending still fails.

## What should I pass for the correct Zoho region when connecting Zoho Mail?

For Zoho Mail connection issues, verify the region passed during connection initiation. Zoho accounts can be region-specific, so an EU or other regional account may fail if the default/wrong region is used. Retry the connection with the correct Zoho region.

## What must Zoho Mail account_id do?

Treat Zoho Mail `account_id` values as strings, not integers. Zoho account IDs can exceed JavaScript's safe integer limit, and numeric coercion can silently truncate them before the tool call reaches Zoho. If a user sees unexpected account IDs or tool failures with long IDs, verify the schema and payload preserve `account_id` as a string.

## How should I handle zoho Mail attachment download support should be treated as a feature request when absent?

If a user needs Zoho Mail attachment download and the current toolkit does not expose that action, submit the exact attachment-download use case through the tool request flow.

## What does Connect MCP mean?

Connect MCP is intended for agent/client workflows through Tool Router, not as a raw direct API endpoint. For Zoho Mail, make sure the user has connected a Zoho Mail account in the Connect dashboard first, then use the supported MCP client flow. If the user wants direct API execution, use Tool Router/API or Proxy Execute patterns instead of treating Connect MCP as a raw REST proxy.
