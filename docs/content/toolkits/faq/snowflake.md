## How do I set up custom OAuth credentials for Snowflake?

Snowflake has no Composio-managed OAuth app, so you create an OAuth security integration in your own Snowflake account and use its credentials in Composio. Snowflake has no web form for this; you create the integration with SQL.

### Create the Snowflake OAuth integration

You need the `ACCOUNTADMIN` role, or a role with the privilege to create integrations.

1. Sign in to [Snowflake](https://app.snowflake.com/) and open a SQL worksheet.
2. Run this command to create a confidential OAuth client that points at Composio:

   ```sql
   CREATE SECURITY INTEGRATION oauth_custom_all_roles
     TYPE = oauth
     ENABLED = true
     OAUTH_CLIENT = custom
     OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
     OAUTH_REDIRECT_URI = 'https://backend.composio.dev/api/v1/auth-apps/add'
     OAUTH_ISSUE_REFRESH_TOKENS = TRUE
     OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
   ```

   `OAUTH_REDIRECT_URI` must exactly match the `oauth_redirect_uri` field in your Composio auth config.
3. Run `DESC SECURITY INTEGRATION oauth_custom_all_roles;` and copy the `OAUTH_CLIENT_ID` value.
4. Run the following command and copy the `OAUTH_CLIENT_SECRET` value from the result:

   ```sql
   SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('OAUTH_CUSTOM_ALL_ROLES') AS SECRETS;
   ```

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Snowflake**.
2. Keep the authentication type as **OAuth2**.
3. Paste the `OAUTH_CLIENT_ID` into **Client ID** and the `OAUTH_CLIENT_SECRET` into **Client Secret**, then click **Create Auth Config**.
4. Click **Connect Account** and enter your Snowflake account identifier in `orgname-accountname` format, for example `myorg-account123`. In Snowsight, click your account in the bottom left and choose **View account details** to find it.
5. Sign in to Snowflake, approve access, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests the `refresh_token` scope, so Composio can refresh access without asking the user to sign in again. Snowflake roles, not OAuth scopes, decide which databases, schemas, and warehouses the connection can use.

## How do I configure roles and permissions for Snowflake?

Ensure the OAuth app and Snowflake roles, databases, and schemas are configured correctly for the integration.

## Does Snowflake require per-user OAuth credentials?

Yes. Snowflake OAuth is tied to the user's Snowflake account and security integration. There is not a single generic Snowflake OAuth app that can safely cover every account, role setup, redirect URI, and security policy.

For a production integration, each Snowflake user should bring the OAuth client credentials from the security integration configured in their own Snowflake account. Create a Composio auth config with those credentials, then let the user connect with the account identifier and permissions for that Snowflake account. This keeps the connection aligned with the user's Snowflake roles, databases, schemas, and refresh-token policy.
