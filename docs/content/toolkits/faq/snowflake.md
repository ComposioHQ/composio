## How do I set up custom OAuth credentials for Snowflake?

For a step-by-step guide on creating and configuring your own Snowflake OAuth credentials with Composio, see [How to create OAuth credentials for Snowflake](https://composio.dev/auth/snowflake).

## How do I create a Snowflake OAuth app?

Example Snowflake SQL to create a security integration for OAuth:

```sql
CREATE SECURITY INTEGRATION oauth_custom_all_roles
  TYPE = oauth
  ENABLED = true
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = 'https://your-app.com/oauth/callback'
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
```

## How do I configure roles and permissions for Snowflake?

Ensure the OAuth app and Snowflake roles, databases, and schemas are configured correctly for the integration.

## Does Snowflake require per-user OAuth credentials?

Yes. Snowflake typically requires per-user OAuth credentials. Users often supply their own credentials when integrating with Composio.

---

## When should I use one Snowflake auth config per user account for multi-tenant SaaS OAuth?

For Snowflake multi-tenant OAuth, create one Composio auth config per user Snowflake account using that user's Snowflake OAuth credentials from `CREATE SECURITY INTEGRATION`. Store the returned `auth_config_id` against the user on your side. When connecting a user, pass the correct `auth_config_id`; Composio will collect the per-connection Account ID, such as `myorg-myaccount`, and use it to construct the Snowflake authorization/token URLs.

## Snowflake Basic auth was deprecated in favor of OAuth2

Snowflake Basic authentication was deprecated and replaced by OAuth2. Users using old Basic-auth Snowflake auth configs or connected accounts should migrate to OAuth2 by creating the Snowflake OAuth security integration, creating a Composio auth config with those credentials, and reconnecting users. Basic-auth actions may differ from OAuth2 actions and should not be treated as the long-term path.

## How do I configure Snowflake OAuth refresh tokens and expect periodic reconnects?

For longer-lived Snowflake OAuth connections, configure the Snowflake security integration with `OAUTH_ISSUE_REFRESH_TOKENS = TRUE` so refresh tokens are issued, and set `OAUTH_REFRESH_TOKEN_VALIDITY` as high as Snowflake allows, such as 7776000 seconds (about 90 days). Even with the max window, Snowflake can require users to reconnect after the refresh-token validity period, so design the product flow to handle periodic reconnects.
