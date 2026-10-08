Use this guide to connect Supabase, configure its tools and endpoints, and troubleshoot permissions or rate limits.

## Connect Supabase with OAuth or an API key

**Confirm the authorized Supabase organization.** Supabase authorization is usually scoped at the organization level. If you have project or account access issues, confirm which Supabase organization/account the connected credentials belong to before treating it as a tool-specific issue.

**Pass the personal token with the required API-key field.** For Supabase API-key auth, create or use an API-key auth config and pass the personal token as `supabase_personal_token` when creating the connected account. The `/api/v3/toolkits/supabase` endpoint can be used to inspect the required connected-account initiation field name.

**Choose either OAuth2 or API_KEY auth.** Supabase supports OAuth2 and API_KEY auth, and both can be initiated through Composio APIs. SDKs are wrappers over the same APIs, so anything possible through the SDK should be possible through the API.

**Initiate the connection explicitly in Cursor.** Ask Cursor/the MCP client to initiate a Supabase connection first. The MCP server should provide an OAuth link, the user completes authentication, and then Supabase tools can execute against the connected account.

## Configure Supabase tools and endpoints

**Add the SQL tool to the MCP server when needed.** `SUPABASE_BETA_RUN_SQL_QUERY` is still supported. Create a Supabase integration/MCP server and explicitly configure the Supabase SQL tool in that MCP server if it is not shown on the simplified Supabase MCP page.

**Use the hosted API base URL for hosted Supabase.** For hosted Supabase, the base URL should be `https://api.supabase.com`. Do not use the project's own Supabase URL unless the customer is self-hosting Supabase. If the wrong base URL was used, delete/recreate the MCP config or connection with the correct base URL.

**Pass a supported custom base URL for self-hosted Supabase.** Supabase tools default to hosted Supabase at `https://api.supabase.com`, while current toolkit versions can accept a base URL for self-hosted instances. If a self-hosted setup fails, verify the toolkit version and that the custom base URL is passed in the supported field.

**Configure Management API scopes on the OAuth app.** Supabase configures Management API OAuth scopes on the OAuth app rather than in
the authorization URL. Set the desired scopes in the customer's Supabase OAuth
app, create the corresponding Composio auth config, and reconnect so the new
grant applies. See Supabase's current [OAuth scope documentation](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes).

## Troubleshoot Supabase permissions and rate limits

**Verify provider-side access for permission errors.** If Supabase returns a permissions/access-control error, verify the connected Supabase account has the required permissions in Supabase. These can be provider-side server permission errors rather than Composio issues.

**Inspect the underlying error for rate limits.** If the customer sees a rate-limit message, capture the underlying Composio/tool/provider error rather than the wrapper agent's message, because the limit may come from the external provider or agent layer rather than a Composio service limit.
