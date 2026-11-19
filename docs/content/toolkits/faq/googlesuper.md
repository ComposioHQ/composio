## How do I set up custom Google OAuth credentials for Google Super?

Use your own Google OAuth app when you need scopes that Composio's managed Google Super app doesn't have approved, your app's name on Google's consent screen, or a dedicated API quota. One OAuth client in one Google Cloud project can serve Google Super and the single-product Google toolkits.

### Create the Google OAuth app

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select the project that will own the OAuth app, or create one.

   ![Google Cloud project picker with the OAuth app's project selected](/images/toolkits/shared/hjaj4jg5CtBRolXXYddY8NDXCes.webp)

2. Go to **APIs & Services** → **Library** and enable the API for each Google product your tools use. There is no separate Google Super API. The default scopes cover the **Gmail API**, **Google Drive API**, **Google Docs API**, **Google Sheets API**, **Google Slides API**, **Google Calendar API**, **Google Tasks API**, **People API** (contacts), **Photos Library API**, **Google Analytics** APIs, and **Google Ads API**. If an API page shows **Manage**, it's already enabled. Enabling an API needs project permissions; ask your project admin if you can't.

   ![Google Drive API page in the Google Cloud API Library with the Enable button](/images/toolkits/shared/VNt0egQy2o9O5i6LMd4JFpNcmAU.webp)

3. Go to **Google Auth Platform** → **Branding**. If you see **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with the app name and user support email fields](/images/toolkits/shared/x4VkWS3iceKKFGyjlFN1THrtTRQ.webp)

4. Under **Audience**, choose the user type. **Internal** limits sign-in to accounts in your Google Workspace organization. **External** allows any Google account. An External app starts in **Testing**; add every account that will connect under **Test users**.

   ![Google Auth Platform Audience page showing Testing status, the External user type, and Test users](/images/toolkits/shared/Jttbz3Cm6xJFWNlukXLGTxWjf6c.webp)

5. Under **Data Access**, click **Add or remove scopes** and add the scopes your auth config will request (see **Scopes** below). Paste any scope missing from the list under **Manually add scopes** and click **Add to table**. Click **Update**, then **Save**.

   ![Data Access scope picker with the drive.metadata.readonly scope selected](/images/toolkits/shared/ch2L6hWRPSOigltUpRF7r9hyA.webp)

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

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-googlesuper), go to **Auth Configs** → **Create** and select **Google Super**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/DUtMN0UWIU2kEqnvS5DvD7qhWU.webp)

   ![Create Auth Config dialog with Google Super in the toolkit search results](/images/toolkits/googlesuper/composio-select-toolkit.webp)

   ![Config Name field for the new Google Super auth config](/images/toolkits/googlesuper/composio-config-name.webp)

2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the **Client ID** and **Client secret**, and leave **Redirect URI** set to `https://backend.composio.dev/api/v1/auth-apps/add`.

   ![Google Super auth config form with Client ID, Client secret, the Composio redirect URI, and a selected scope](/images/toolkits/googlesuper/composio-auth-config-form.webp)

3. Choose the scopes your tools need, matching the ones you added under **Data Access**, then click **Create Auth Config**.
4. Click **Connect Account**, sign in with a Google account that can use the app (a test user while the app is in **Testing**), and approve the consent screen. Under **Accounts**, confirm the connection shows **Active**. The auth config's **Enabled** label doesn't mean an account is connected.

   ![Google's unverified-app notice for an app in Testing](/images/toolkits/shared/M0mS4XrLbK5mU52ry578MBa7M.webp)

   ![Google consent screen for the Google Super connection](/images/toolkits/googlesuper/google-consent-screen.webp)

   ![Google Super auth config details with an Active connected account](/images/toolkits/googlesuper/composio-connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

To add another Google toolkit later, enable its API in the same project and reuse this OAuth client in a new auth config.

### Scopes

The default Google Super auth config requests broad scopes across products: `https://mail.google.com/`, `drive`, `documents`, `spreadsheets`, `presentations`, `calendar`, `tasks`, `contacts.readonly`, `analytics`, `analytics.readonly`, `adwords`, the Photos `appcreateddata` read and edit scopes, `userinfo.email`, and `userinfo.profile`. Remove the ones for products you don't use, and prefer narrower scopes where they cover your tools. For example, listing Drive file metadata only needs `drive.metadata.readonly`. See Google's [OAuth 2.0 scope list](https://developers.google.com/identity/protocols/oauth2/scopes).

Short scope names on this page leave out the `https://www.googleapis.com/auth/` prefix. When you paste a scope under **Manually add scopes**, use the full URL, for example `https://www.googleapis.com/auth/userinfo.email`. Scopes already written as a full URL, such as `https://mail.google.com/`, go in as shown.

If you change the scopes later, reconnect the account so the user grants the new access.

### Testing, publishing, and verification

- While an External app is in **Testing**, only test users can connect, and Google can show them an unverified-app notice. Google generally expires their authorizations after seven days, so they need to reconnect.
- To let any Google account connect, publish the app under **Audience**. Publishing doesn't verify the app.
- Public apps that request sensitive or restricted scopes generally need Google's OAuth verification. Check **Google Auth Platform** → **Verification Center**. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- Several default scopes, including `https://mail.google.com/` and `drive`, are restricted. A public app that requests them needs restricted-scope verification, which can include a security assessment if your servers store or transmit that data.
- If Google blocks sign-in, check the app's audience, the test user list, the requested scopes, and your Workspace admin's app access policy.

## Why am I seeing "App is blocked" when connecting Google Super?

Google can block consent when the OAuth client requests scopes that Google hasn't approved for that client. Follow [Google scope approvals and blocked-app troubleshooting](/docs/authentication/controlling-scopes#google-scope-approvals) to check the auth config and requested scopes. Toolkit defaults and scope recommendations don't establish the managed app's approved scopes.

If a required scope isn't approved for the managed app, use your own Google OAuth app with the required verification and reconnect through a custom auth config. See [Managed vs custom auth](/docs/authentication/custom-app-vs-managed-app) and the setup steps above.

## Why am I getting the "API has not been used in project" error?

When using custom OAuth credentials, the required Google API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).
