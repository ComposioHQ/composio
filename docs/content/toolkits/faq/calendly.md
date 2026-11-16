## How do I set up custom OAuth credentials for Calendly?

Use your own Calendly OAuth app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Calendly app

1. Sign in to the [Calendly developer portal](https://developer.calendly.com/) and click **My Apps**.
2. Click **Create New App** and fill in the form:
   - **Name of app**: for example, `Composio-Calendly`.
   - **Kind of app**: **Web**.
   - **Environment type**: **Sandbox** for development and testing. Switch to **Production** when you go live.
   - **Redirect URI**: `https://backend.composio.dev/api/v1/auth-apps/add`. It must use `https`, have no trailing slash, and exactly match the `oauth_redirect_uri` field in your Composio auth config.
3. Save the app and copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Calendly**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, then click **Create Calendly Auth Config**.
4. Click **Connect Account**, approve access in Calendly, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

## Why can't I configure individual scopes for Calendly?

Calendly does not let end users selectively approve individual scopes during the OAuth connection flow. The scopes configured in your Calendly OAuth app are the scopes that will be requested during authorization, and the resulting access token will include that configured permission set.

To change Calendly permissions, update the scopes in your OAuth app/auth config and reconnect the account so a new token is issued with the updated scopes.
