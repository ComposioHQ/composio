Use this guide to connect Airtable, discover and execute current tools, and configure metadata triggers.

## Connect and authenticate Airtable

**Connect Airtable to Claude through MCP.** Airtable can be connected to Claude through Composio MCP. Create or use an MCP server with Airtable tools selected, add the MCP server configuration to Claude, and complete the Airtable account connection from the MCP/connect flow.

**Use custom OAuth credentials for additional scopes.** For additional Airtable scopes, use your own Airtable OAuth developer app. Configure the required scopes in Airtable, enable/use custom OAuth credentials in Composio, and create a new integration/auth config with those credentials and scopes. If an existing integration was created before the scope change, create a new one and retry the connection.

**Restart connection flows that exceed ten minutes.** The expiry reason "Connection initiation did not complete within 10 minutes" means the user opened or initiated the connection but did not finish the authentication flow within ten minutes. It is a generic connected-account timeout across toolkits, not an Airtable-specific error. Start a fresh connection/initiation link and complete the OAuth flow within the allowed window.

## Discover and execute Airtable tools

**Increase list limits and use a current toolkit version.** If Airtable tools appear missing, first increase the tools list limit or paginate
because the response may contain only the first page. Explicitly request the
latest toolkit version when a pinned version lacks a current action. Old names
such as `create_multiple_records` and `create_record` were deprecated in favor
of current uppercase slugs such as `AIRTABLE_CREATE_RECORDS`.

**Batch updates in groups of ten records.** `AIRTABLE_UPDATE_MULTIPLE_RECORDS` can update a maximum of 10 Airtable records at a time. For larger updates, split the records into batches of 10 and execute multiple calls while respecting Airtable's API rate limits.

## Configure Airtable metadata triggers

**Choose an event from the current trigger catalog.** The current Airtable toolkit exposes triggers for base metadata changes, base schema changes, user profile changes, and view creation, deletion, or metadata changes. Fetch the current trigger catalog before implementation and use the exact returned slug. If the needed event is not in that catalog, submit that Airtable event through the Composio request portal.
