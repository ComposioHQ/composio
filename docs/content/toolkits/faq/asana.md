## How do I set up custom OAuth credentials for Asana?

Use your own Asana app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Asana app

1. Sign in to Asana and open the [Asana developer console](https://app.asana.com/0/my-apps).
2. Click **+ New App** and enter an app name, such as `Composio Integration`. The app website is optional.
3. In the app's OAuth settings, add the redirect URL `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
4. Save the app and copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Asana**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, add any scopes you need, then click **Create Asana Auth Config**.
4. Click **Connect Account**, sign in to Asana, and approve access to your workspace. Confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config doesn't request specific scopes. To request granular scopes such as `tasks:read`, `projects:read`, or `workspaces:read`, enable them in the Asana app's OAuth settings and add the same values to the auth config's **Scopes** field. Request only what your integration uses.
