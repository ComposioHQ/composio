## How do I set up custom OAuth credentials for Dropbox?

Use your own Dropbox app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Dropbox app

1. Sign in to Dropbox and open the [Dropbox App Console](https://www.dropbox.com/developers/apps).
2. Click **Create app** and choose **Scoped access**.

   ![Dropbox App Console My apps page with the Create app button](/images/toolkits/dropbox/create-app.webp)

   ![Dropbox create app form with Scoped access and the access type options](/images/toolkits/dropbox/scoped-access.webp)
3. Choose the access type: **App folder** (one dedicated folder) or **Full Dropbox** (all files).
4. Enter an app name, such as `Composio-Dropbox`, and click **Create app**.

   ![Dropbox create app form with the app name and Create app button](/images/toolkits/dropbox/name-app.webp)
5. On the **Settings** tab, copy the **App key** (client ID) and **App secret** (client secret).
6. In the **OAuth 2** section, under **Redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config, or Dropbox rejects the OAuth flow.
7. On the **Permissions** tab, check the scopes your auth config will request (see below) and save.

   ![Dropbox app Permissions tab with scope checkboxes](/images/toolkits/dropbox/permissions.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Dropbox**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Create Auth Config drawer searching for Dropbox](/images/toolkits/dropbox/select-dropbox.webp)
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.

   ![Dropbox auth config form with OAuth2 selected and Use your own developer credentials turned on](/images/toolkits/dropbox/auth-config-oauth2.webp)
3. Paste the **App key** as the **Client ID** and the **App secret** as the **Client Secret**, then click **Create Dropbox Auth Config**.

   ![Dropbox auth config form with Client id and Client secret fields](/images/toolkits/dropbox/auth-config-credentials.webp)
4. Click **Connect Account**, approve access in Dropbox, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `openid`, `email`, `profile`, and the read and write scopes for `account_info`, `files.metadata`, `files.content`, `file_requests`, `sharing`, and `contacts` (for example `files.content.read` and `files.content.write`). Enable the same permissions on the Dropbox app, or trim the auth config's **Scopes** field to the ones you enabled.
