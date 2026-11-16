## How do I set up custom Google OAuth credentials for Google Merchant Center?

Composio doesn't provide a managed OAuth app for Google Merchant Center, so you need your own Google OAuth app to connect it.

Connect with a Google account that has Merchant Center access. For first-time developer registration, Google requires an existing production Merchant Center account with a verified homepage and an authorized admin.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.

   ![Google Cloud console project picker](/images/toolkits/shared/9j8wjr2HocIhIsgedntpgb4m8Y.webp)

2. Open **APIs & Services** → **Library**, search for **Merchant API** (`merchantapi.googleapis.com`), and select **Enable**. If the page shows **Manage**, the API is already enabled.
3. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with app name and user support email](/images/toolkits/shared/Q8INvnJoiCMyajqrrAtq6ovCE5U.webp)

4. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.

   ![Google Auth Platform Audience page with Testing status, External user type, and Test users](/images/toolkits/shared/BetTxXqa2c1dgg4QeV4g9RV008.webp)

5. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.
6. Open **Clients** → **Create client**, choose **Web application**, and give it a name.

   ![Create OAuth client ID form with Web application selected](/images/toolkits/shared/S7mFFv6C5mCP4y0ScTzRzQd8Nc.webp)

7. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.

   ![OAuth client form with the Composio redirect URI under Authorized redirect URIs](/images/toolkits/shared/1qh7A0aEGRUU1K19aU37FrcxTY.webp)

8. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

   ![Google OAuth web client details with Client ID and Client secret](/images/toolkits/shared/TmVTLOgVKQDqamjQVxKDBXJtPQ.webp)

9. Complete Google's one-time [developer registration](https://developers.google.com/merchant/api/guides/quickstart/registration) for the Cloud project that owns your OAuth client. An authorized Merchant Center admin links the project to the Merchant Center account.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Merchant Center**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in with a Google account that has Merchant Center access. If the connection check reports that the Google Cloud project is unregistered, finish developer registration for that project and try again.

   ![Google consent screen asking to manage your product listings and accounts for Google Shopping](/images/toolkits/google_merchant/google-consent-screen.webp)

4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/content`. Merchant API account listing requires it, and it also allows any write operations the user's Merchant Center role permits. See the [accounts.list reference](https://developers.google.com/merchant/api/reference/rest/accounts_v1/accounts/list).

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.
