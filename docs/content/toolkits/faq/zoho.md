## How do I set up custom OAuth credentials for Zoho CRM?

For a step-by-step guide on creating and configuring your own Zoho CRM OAuth credentials with Composio, see [How to create OAuth credentials for Zoho CRM](https://composio.dev/auth/zoho).

## Zoho connections require the correct region/domain extension

Zoho requires the correct region/domain extension during connection initiation. Accepted values include `com`, `eu`, `in`, `cn`, and `au`. Pass the user's Zoho account region, not a full URL, so Composio can build the correct `accounts.zoho.<region>` URL.

## Zoho Mail uses `suffix.one` as the connection initiation domain-extension field

For Zoho Mail, the expected connection initiation field can appear as `suffix.one`, displayed as Domain Extension. Pass values such as `com`, `eu`, or `in` in `config.val["suffix.one"]` when initiating the connection.

## Zoho MCP setup uses OAuth2 and should initiate a new connection from the client/dashboard

Zoho uses OAuth2. For MCP setups, create an MCP config for Zoho, then initiate/connect the Zoho account through the MCP client or dashboard. If the client does not automatically start the OAuth flow, prompting it to initiate a new Zoho connection can help.
