## How do I set up custom OAuth credentials for Linear?

Use your own Linear OAuth application when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Linear app

1. Sign in to [Linear](https://linear.app/) and open your workspace's [API settings](https://linear.app/settings/api).
2. Create a new OAuth application and give it a name.
3. In **Callback URLs**, enter `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
4. Fill in the remaining required fields and create the application.
5. On the application page that opens, copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Linear**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, adjust the scopes if needed, then click **Create Linear Auth Config**.
4. Click **Connect Account**, click **Authorize** on Linear's consent screen, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `read`, `write`, `issues:create`, and `comments:create`. Remove any you don't need from the auth config's **Scopes** field. Linear also offers an `admin` scope; add it only if your integration needs admin access.

## Can I connect Linear with an API key?

Yes. Create an auth config with the **API Key** auth type. Each user creates a personal API key in Linear under **Settings** > **Security & access** > **Personal API keys** and pastes it when connecting. Keys start with `lin_api_`.
