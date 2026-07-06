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

Yes. Snowflake OAuth is tied to the user's Snowflake account and security integration. There is not a single generic Snowflake OAuth app that can safely cover every account, role setup, redirect URI, and security policy.

For a production integration, each Snowflake user should bring the OAuth client credentials from the security integration configured in their own Snowflake account. Create a Composio auth config with those credentials, then let the user connect with the account identifier and permissions for that Snowflake account. This keeps the connection aligned with the user's Snowflake roles, databases, schemas, and refresh-token policy.
