## How does Supabase authorization scope work?

Supabase authorization is usually scoped at the organization level. If a user reports project/account access issues, confirm which Supabase organization/account the connected credentials belong to before treating it as a tool issue.

## Supabase API key connections pass `supabase_personal_token` during connected account creation

For Supabase API-key auth, create or use an API-key auth config and pass the personal token as `supabase_personal_token` when creating the connected account. The `/api/v3/toolkits/supabase` endpoint can be used to inspect the required connected-account initiation field name.

## Does Supabase support both OAuth2 and API_KEY auth through Composio APIs?

Supabase supports OAuth2 and API_KEY auth, and both can be initiated through Composio APIs. SDKs are wrappers over the same APIs, so anything possible through the SDK should be possible through the API.

## How do I use `SUPABASE_BETA_RUN_SQL_QUERY`?

`SUPABASE_BETA_RUN_SQL_QUERY` is still supported. Create a Supabase integration/MCP server and explicitly configure the Supabase SQL tool in that MCP server if it is not shown on the simplified Supabase MCP page.

## Hosted Supabase should use `https://api.supabase.com` as base URL, not the project URL

For hosted Supabase, the base URL should be `https://api.supabase.com`. Do not use the project's own Supabase URL unless the user is self-hosting Supabase. If the wrong base URL was used, delete/recreate the MCP config or connection with the correct base URL.

## Limit Supabase scopes in the user's OAuth app, not through Composio's default app

For Supabase permission scoping, configure the desired permissions in the user's own OAuth app and create the Composio auth config with that app. The default Composio OAuth app may be configured with broader permissions.

## Cursor MCP server-name length limits

Cursor tool/server-name length limits can affect Supabase MCP setups. Rename the server from a long name such as `supabase_composio` to something shorter like `supa`.
