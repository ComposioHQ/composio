## How do I set up custom Google OAuth credentials for Google Business Profile?

Composio doesn't provide a managed OAuth app for Google Business Profile, so you need your own Google OAuth app to connect it.

Connect with a Google account that owns or manages the Business Profile. Your Google Cloud project also needs Business Profile API access, which Google approves separately. Google lists a verified profile that has been active for at least 60 days and a matching business website among the [application requirements](https://developers.google.com/my-business/content/prereqs).

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.

   ![Google Cloud console project picker](/images/toolkits/shared/9j8wjr2HocIhIsgedntpgb4m8Y.webp)

2. Request Business Profile API access for your Cloud project and wait for Google's approval.
3. After approval, open **APIs & Services** → **Library**, search for **My Business Account Management API** (`mybusinessaccountmanagement.googleapis.com`), and select **Enable**. If the page shows **Manage**, the API is already enabled. Composio uses it to list accounts and check the connection. Enable any other Business Profile APIs your actions use. See Google's [basic setup](https://developers.google.com/my-business/content/basic-setup).
4. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with app name and user support email](/images/toolkits/shared/Q8INvnJoiCMyajqrrAtq6ovCE5U.webp)

5. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.

   ![Google Auth Platform Audience page with Testing status, External user type, and Test users](/images/toolkits/shared/BetTxXqa2c1dgg4QeV4g9RV008.webp)

6. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.
7. Open **Clients** → **Create client**, choose **Web application**, and give it a name.

   ![Create OAuth client ID form with Web application selected](/images/toolkits/shared/S7mFFv6C5mCP4y0ScTzRzQd8Nc.webp)

8. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.

   ![OAuth client form with the Composio redirect URI under Authorized redirect URIs](/images/toolkits/shared/1qh7A0aEGRUU1K19aU37FrcxTY.webp)

9. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

   ![Google OAuth web client details with Client ID and Client secret](/images/toolkits/shared/TmVTLOgVKQDqamjQVxKDBXJtPQ.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Business Profile**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in with the Google account that manages the profile. If the Account Management API is unavailable or shows a quota of zero, the project's Business Profile API access hasn't been approved. OAuth app verification and Business Profile API approval are separate.

   ![Google consent screen asking to manage your Google business listings](/images/toolkits/google_business_profile/google-consent-screen.webp)

4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/business.manage`. Account listing requires it, and it can authorize changes to any profile the signed-in user can manage.

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.
