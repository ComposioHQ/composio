## How do I set up custom Google OAuth credentials for Google Forms?

Google Forms has no Composio-managed OAuth app, so you need your own Google OAuth app to connect it.

### Create the Google OAuth app

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select the project that will own the OAuth app, or create one.
2. Go to **APIs & Services** → **Library**, search for **Google Forms API**, and click **Enable**. The default scopes include Drive access, so enable the **Google Drive API** too. If the API page shows **Manage**, the API is already enabled. Enabling an API needs project permissions; ask your project admin if you can't.
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

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Google Forms**.
2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the **Client ID** and **Client secret**, and leave **Redirect URI** set to `https://backend.composio.dev/api/v1/auth-apps/add`.
3. Choose the scopes your tools need, matching the ones you added under **Data Access**, then click **Create Auth Config**.
4. Click **Connect Account**, sign in with a Google account that can use the app (a test user while the app is in **Testing**), and approve the consent screen. Under **Accounts**, confirm the connection shows **Active**.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default Google Forms auth config requests `https://www.googleapis.com/auth/forms.body`, `forms.body.readonly`, `forms.responses.readonly`, `drive`, `drive.file`, and `drive.readonly`. Reading form definitions needs `forms.body.readonly`, reading submitted responses needs `forms.responses.readonly`, and creating or editing forms needs `forms.body`. Keep the Drive scopes only if your tools search or manage form files through Drive. See Google's [Forms scope reference](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms/get).

If you change the scopes later, reconnect the account so the user grants the new access.

### Testing, publishing, and verification

- While an External app is in **Testing**, only test users can connect, and Google can show them an unverified-app notice. Google generally expires their authorizations after seven days, so they need to reconnect.
- To let any Google account connect, publish the app under **Audience**. Publishing doesn't verify the app.
- Public apps that request sensitive or restricted scopes generally need Google's OAuth verification. Check **Google Auth Platform** → **Verification Center**. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- The default `drive` and `drive.readonly` scopes are restricted. A public app that requests them needs restricted-scope verification, which can include a security assessment.
- If Google blocks sign-in, check the app's audience, the test user list, the requested scopes, and your Workspace admin's app access policy.
