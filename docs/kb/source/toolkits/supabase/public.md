---
type: "reference"
title: "Supabase"
description: "Public support knowledge for Supabase."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "supabase"
---
# Supabase


## Supabase authorization is usually organization-scoped

Supabase authorization is usually scoped at the organization level. If a customer reports project/account access issues, confirm which Supabase organization/account the connected credentials belong to before treating it as a tool-specific issue.

## Supabase API-key connections pass `supabase_personal_token` during connected account creation

For Supabase API-key auth, create or use an API-key auth config and pass the personal token as `supabase_personal_token` when creating the connected account. The `/api/v3/toolkits/supabase` endpoint can be used to inspect the required connected-account initiation field name.

## Supabase supports both OAuth2 and API_KEY auth through Composio APIs

Supabase supports OAuth2 and API_KEY auth, and both can be initiated through Composio APIs. SDKs are wrappers over the same APIs, so anything possible through the SDK should be possible through the API.

## Supabase MCP in Cursor may need an explicit initiate-connection step

Ask Cursor/the MCP client to initiate a Supabase connection first. The MCP server should provide an OAuth link, the user completes authentication, and then Supabase tools can execute against the connected account.

## `SUPABASE_BETA_RUN_SQL_QUERY` is still available when configured in an MCP server

`SUPABASE_BETA_RUN_SQL_QUERY` is still supported. Create a Supabase integration/MCP server and explicitly configure the Supabase SQL tool in that MCP server if it is not shown on the simplified Supabase MCP page.

## Hosted Supabase should use `https://api.supabase.com` as base URL, not the project URL

For hosted Supabase, the base URL should be `https://api.supabase.com`. Do not use the project's own Supabase URL unless the customer is self-hosting Supabase. If the wrong base URL was used, delete/recreate the MCP config or connection with the correct base URL.

## Self-hosted Supabase requires toolkit support for a custom base URL

Supabase tools default to hosted Supabase at `https://api.supabase.com`, while current toolkit versions can accept a base URL for self-hosted instances. If a self-hosted setup fails, verify the toolkit version and that the custom base URL is passed in the supported field.

## Configure Supabase Management API scopes on the Supabase OAuth app

Supabase configures Management API OAuth scopes on the OAuth app rather than in
the authorization URL. Set the desired scopes in the customer's Supabase OAuth
app, create the corresponding Composio auth config, and reconnect so the new
grant applies. See Supabase's current [OAuth scope documentation](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes).

## Supabase permission errors are often provider-side access-control failures

If Supabase returns a permissions/access-control error, verify the connected Supabase account has the required permissions in Supabase. These can be provider-side server permission errors rather than Composio issues.

## Diagnose Supabase rate limits from the underlying error

If the customer sees a rate-limit message, capture the underlying Composio/tool/provider error rather than the wrapper agent's message, because the limit may come from the external provider or agent layer rather than a Composio service limit.
