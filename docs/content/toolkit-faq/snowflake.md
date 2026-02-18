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

## Does Snowflake require per-customer OAuth credentials?

Yes. Snowflake typically requires per-customer OAuth credentials. Customers often supply their own credentials when integrating with Composio.

---
