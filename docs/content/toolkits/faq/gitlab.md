## How do I set up custom OAuth credentials for GitLab?

Use your own GitLab OAuth application when you want users to see your app's name on the consent screen, or when you connect to a self-managed GitLab instance.

### Create the GitLab app

1. Sign in to GitLab, click your avatar in the top-right corner, and select **Edit profile**.
2. In the left sidebar, click **Applications** (direct link on GitLab.com: `https://gitlab.com/-/profile/applications`). On a self-managed instance, use the same path on your own host.
3. Click **New application** and enter a name, such as `Composio GitLab Integration`.
4. In **Redirect URI**, paste `https://backend.composio.dev/api/v1/auth-apps/add` with no trailing `/`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
5. Select the scopes your integration needs, then click **Save application**.
6. Copy the **Application ID** (your Client ID) and the **Secret** (your Client Secret). GitLab shows the secret only once.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **GitLab**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the Application ID as **Client ID** and the Secret as **Client Secret**. Add the same scopes you selected in GitLab, then click **Create GitLab Auth Config**.
4. Click **Connect Account**, approve the permissions on the GitLab consent screen, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `api`, `read_api`, `read_user`, `read_repository`, `write_repository`, `profile`, and `email`. `api` grants full read/write API access; use `read_api` instead for read-only access. Select only the scopes you need in the GitLab app and use the same list in the auth config.

### Self-managed GitLab

The OAuth2 auth config has two URL fields:

- `full`: your GitLab server URL with `/api/v4` appended. The default is `https://gitlab.com/api/v4`.
- `authorizationUrl`: your GitLab server URL without the API path. The default is `https://gitlab.com`.

For a self-managed instance, create the OAuth application on that instance and set both fields to your instance's URL, for example `https://gitlab.example.com/api/v4` and `https://gitlab.example.com`.
