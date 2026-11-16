## How do I set up custom Google OAuth credentials for Google Analytics?

Use your own Google OAuth app when you want your app name on the consent screen, your own API quota, or full control over the requested scopes.

The Google account you connect needs a role on the Analytics property. Use a GA4 property ID for GA4 reports.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.
2. Open **APIs & Services** → **Library**, search for **Google Analytics Data API**, and select **Enable**. If the page shows **Manage**, the API is already enabled.
3. If your workflow lists accounts or manages properties, enable **Google Analytics Admin API** too. See Google's [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart).
4. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.
5. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.
6. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.
7. Open **Clients** → **Create client**, choose **Web application**, and give it a name.
8. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.
9. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Analytics**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in with the Google account you want to connect. Review the requested permissions before you continue.
4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/analytics.readonly`, `https://www.googleapis.com/auth/analytics`, `https://www.googleapis.com/auth/userinfo.profile`. `analytics.readonly` is enough to read reports. Editing configuration or managing users needs broader scopes and the matching Analytics role. See the [runReport reference](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.
