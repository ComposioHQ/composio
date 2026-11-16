## How do I set up custom Google OAuth credentials for Google Sheets?

Use your own Google OAuth app when you want your app's name on Google's consent screen, a dedicated API quota, or scopes that Composio's managed app doesn't cover.

### Create the Google OAuth app

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select the project that will own the OAuth app, or create one.

   ![Google Cloud project picker with the OAuth app's project selected](/images/toolkits/shared/hjaj4jg5CtBRolXXYddY8NDXCes.webp)

2. Go to **APIs & Services** → **Library**, search for **Google Sheets API**, and click **Enable**. The default scopes include Drive access, so enable the **Google Drive API** too if your tools search or manage spreadsheets through Drive. If the API page shows **Manage**, the API is already enabled. Enabling an API needs project permissions; ask your project admin if you can't.

   ![Google Sheets API page in the Google Cloud API Library with the Enable button](/images/toolkits/googlesheets/enable-sheets-api.webp)

3. Go to **Google Auth Platform** → **Branding**. If you see **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with the app name and user support email fields](/images/toolkits/shared/x4VkWS3iceKKFGyjlFN1THrtTRQ.webp)

4. Under **Audience**, choose the user type. **Internal** limits sign-in to accounts in your Google Workspace organization. **External** allows any Google account. An External app starts in **Testing**; add every account that will connect under **Test users**.

   ![Google Auth Platform Audience page showing Testing status, the External user type, and Test users](/images/toolkits/shared/Jttbz3Cm6xJFWNlukXLGTxWjf6c.webp)

5. Under **Data Access**, click **Add or remove scopes** and add the scopes your auth config will request (see **Scopes** below). Paste any scope missing from the list under **Manually add scopes** and click **Add to table**. Click **Update**, then **Save**.

   ![Data Access scope picker with the spreadsheets.readonly scope selected](/images/toolkits/googlesheets/data-access-scopes.webp)

6. Under **Clients**, click **Create client**. Set **Application type** to **Web application**, name the client, and add this URI under **Authorized redirect URIs**:

   ```
   https://backend.composio.dev/api/v1/auth-apps/add
   ```

   It must exactly match the `oauth_redirect_uri` field of your Composio auth config.

   ![Create OAuth client ID form with Web application selected](/images/toolkits/shared/sA0bvCBPtMCWw8lqecCrx76Dyc.webp)

   ![Create OAuth client ID form with the Composio redirect URI under Authorized redirect URIs](/images/toolkits/shared/jDTS80dlfwHF6u1WAQhBdnjTrI.webp)

7. Click **Create**. Copy the **Client ID** and **Client secret** before you close the dialog, and store the secret privately.

   ![OAuth client created dialog with the Client ID and Client secret](/images/toolkits/shared/YdKWAswsL2nVXnSbA4zgBUDmwA.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Google Sheets**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/DUtMN0UWIU2kEqnvS5DvD7qhWU.webp)

   ![Create Auth Config dialog with Google Sheets in the toolkit search results](/images/toolkits/googlesheets/composio-select-toolkit.webp)

   ![Config Name field for the new Google Sheets auth config](/images/toolkits/googlesheets/composio-config-name.webp)

2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the **Client ID** and **Client secret**, and leave **Redirect URI** set to `https://backend.composio.dev/api/v1/auth-apps/add`.

   ![Google Sheets auth config form with Client ID, Client secret, the Composio redirect URI, and a selected scope](/images/toolkits/googlesheets/composio-auth-config-form.webp)

3. Choose the scopes your tools need, matching the ones you added under **Data Access**, then click **Create Auth Config**.
4. Click **Connect Account**, sign in with a Google account that can use the app (a test user while the app is in **Testing**), and approve the consent screen. Under **Accounts**, confirm the connection shows **Active**.

   ![Google's unverified-app notice for an app in Testing](/images/toolkits/shared/M0mS4XrLbK5mU52ry578MBa7M.webp)

   ![Google consent screen asking to see all Google Sheets spreadsheets](/images/toolkits/googlesheets/google-consent-screen.webp)

   ![Google Sheets auth config details with an Active connected account](/images/toolkits/googlesheets/composio-connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default Google Sheets auth config requests `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive`, and `userinfo.email`. To only read spreadsheets by ID, `spreadsheets.readonly` is enough. Editing needs `spreadsheets`, and finding files through Drive needs a Drive scope. See Google's [Sheets scope reference](https://developers.google.com/workspace/sheets/api/scopes).

If you change the scopes later, reconnect the account so the user grants the new access.

### Testing, publishing, and verification

- While an External app is in **Testing**, only test users can connect, and Google can show them an unverified-app notice. Google generally expires their authorizations after seven days, so they need to reconnect.
- To let any Google account connect, publish the app under **Audience**. Publishing doesn't verify the app.
- Public apps that request sensitive or restricted scopes generally need Google's OAuth verification. Check **Google Auth Platform** → **Verification Center**. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- The default `drive` scope is restricted. A public app that requests it needs restricted-scope verification, which can include a security assessment.
- If Google blocks sign-in, check the app's audience, the test user list, the requested scopes, and your Workspace admin's app access policy.

## Why am I seeing "App is blocked" when connecting Google Sheets?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification, as described in the setup steps above.

## Why am I getting "Google Sheets API has not been used in project" error?

When using custom OAuth credentials, the Google Sheets API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit was exceeded. Re-authenticating the user typically resolves this.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. These errors may also appear as a 429. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.
