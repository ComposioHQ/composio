## How do I set up custom Google OAuth credentials for Google Drive?

Use your own Google OAuth app when you want your app's name on Google's consent screen, a dedicated API quota, or scopes that Composio's managed app doesn't cover.

### Create the Google OAuth app

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select the project that will own the OAuth app, or create one.
2. Go to **APIs & Services** → **Library**, search for **Google Drive API**, and click **Enable**. If the API page shows **Manage**, the API is already enabled. Enabling an API needs project permissions; ask your project admin if you can't.
3. Go to **Google Auth Platform** → **Branding**. If you see **Get started**, enter the app name, user support email, and developer contact email, then save.
4. Under **Audience**, choose the user type. **Internal** limits sign-in to accounts in your Google Workspace organization. **External** allows any Google account. An External app starts in **Testing**; add every account that will connect under **Test users**.
5. Under **Data Access**, click **Add or remove scopes** and add the scopes your auth config will request (see **Scopes** below). Paste any scope missing from the list under **Manually add scopes** and click **Add to table**. Click **Update**, then **Save**.
6. Under **Clients**, click **Create client**. Set **Application type** to **Web application**, name the client, and add this URI under **Authorized redirect URIs**:

   ```
   https://backend.composio.dev/api/v1/auth-apps/add
   ```

   It must exactly match the `oauth_redirect_uri` field of your Composio auth config.
7. Click **Create**. Copy the **Client ID** and **Client secret** before you close the dialog, and store the secret privately.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Google Drive**.
2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the **Client ID** and **Client secret**, and leave **Redirect URI** set to `https://backend.composio.dev/api/v1/auth-apps/add`.
3. Choose the scopes your tools need, matching the ones you added under **Data Access**, then click **Create Auth Config**.
4. Click **Connect Account**, sign in with a Google account that can use the app (a test user while the app is in **Testing**), and approve the consent screen. Under **Accounts**, confirm the connection shows **Active**.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default Google Drive auth config requests `https://www.googleapis.com/auth/drive` (full Drive access) and `userinfo.email`. Narrower scopes exist: `drive.metadata.readonly` lists file metadata but can't download content, and `drive.file` covers only files your app creates or the user opens with it. See Google's [Drive scope reference](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

If you change the scopes later, reconnect the account so the user grants the new access.

### Testing, publishing, and verification

- While an External app is in **Testing**, only test users can connect, and Google can show them an unverified-app notice. Google generally expires their authorizations after seven days, so they need to reconnect.
- To let any Google account connect, publish the app under **Audience**. Publishing doesn't verify the app.
- Public apps that request sensitive or restricted scopes generally need Google's OAuth verification. Check **Google Auth Platform** → **Verification Center**. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- `drive` and `drive.metadata.readonly` are restricted scopes. A public app that requests them needs restricted-scope verification, which can include a security assessment if your servers store or transmit Drive data.
- If Google blocks sign-in, check the app's audience, the test user list, the requested scopes, and your Workspace admin's app access policy.

## Why am I seeing "App is blocked" when connecting Google Drive?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification, as described in the setup steps above.

## Why am I getting "Google Drive API has not been used in project" error?

When using custom OAuth credentials, the Google Drive API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.
