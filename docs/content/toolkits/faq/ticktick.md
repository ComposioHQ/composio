## How do I set up custom OAuth credentials for TickTick?

Use your own TickTick OAuth app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the TickTick app

1. Sign in to the [TickTick Developer Center](https://developer.ticktick.com/) and open **My Apps**.
2. Click **Create App** and fill in the form:
   - **App Name**: for example, `Composio-TickTick`.
   - **App Description**: a short description of your integration.
   - **Redirect URI**: `https://backend.composio.dev/api/v1/auth-apps/add`. It must use `https`, have no trailing slash, and exactly match the `oauth_redirect_uri` field in your Composio auth config.
3. Save the app and copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **TickTick**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Composio toolkit picker with TickTick selected](/images/toolkits/ticktick/select-toolkit.webp)
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.

   ![TickTick auth config form with OAUTH2 and the tasks:read and tasks:write scopes](/images/toolkits/ticktick/oauth2-auth-method.webp)

   ![Use your own developer credentials toggle turned on](/images/toolkits/ticktick/own-credentials-toggle.webp)
3. Paste the **Client ID** and **Client Secret**, then click **Create TickTick Auth Config**.
4. Click **Connect Account**, approve access in TickTick, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

TickTick has no scope settings in its developer dashboard. Scopes are requested during authorization, and the default auth config requests `tasks:read` and `tasks:write`.
