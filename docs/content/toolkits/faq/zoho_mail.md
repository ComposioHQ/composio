## What should I pass for the correct Zoho region when connecting Zoho Mail?


For Zoho Mail connection issues, verify the region passed during connection initiation. Zoho accounts can be region-specific, so an EU or other regional account may fail if the default/wrong region is used. Retry the connection with the correct Zoho region.

## How should I use Connect MCP with Zoho Mail?


Connect MCP is intended for agent/client workflows through Tool Router, not as a raw direct API endpoint. For Zoho Mail, make sure the user has connected a Zoho Mail account in the Connect dashboard first, then use the supported MCP client flow. If the user wants direct API execution, use Tool Router/API or Proxy Execute patterns instead of treating Connect MCP as a raw REST proxy.
