## How do I set up custom Google OAuth credentials for Google Analytics?

Use your own Google OAuth app when you want your app name on the consent screen, your own API quota, or full control over the requested scopes.

The Google account you connect needs a role on the Analytics property. Use a GA4 property ID for GA4 reports.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.

   ![Google Cloud console project picker](/images/toolkits/shared/hjaj4jg5CtBRolXXYddY8NDXCes.webp)

2. Open **APIs & Services** → **Library**, search for **Google Analytics Data API**, and select **Enable**. If the page shows **Manage**, the API is already enabled.

   ![Google Analytics Data API page in the API Library with the Enable button](/images/toolkits/google_analytics/enable-analytics-data-api.webp)

3. If your workflow lists accounts or manages properties, enable **Google Analytics Admin API** too. See Google's [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart).
4. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with app name and user support email](/images/toolkits/shared/x4VkWS3iceKKFGyjlFN1THrtTRQ.webp)

5. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.

   ![Google Auth Platform Audience page with Testing status, External user type, and Test users](/images/toolkits/shared/Jttbz3Cm6xJFWNlukXLGTxWjf6c.webp)

6. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.

   ![Data Access scope picker with the analytics.readonly scope selected](/images/toolkits/google_analytics/data-access-analytics-scope.webp)

7. Open **Clients** → **Create client**, choose **Web application**, and give it a name.

   ![Create OAuth client ID form with Web application selected and a client name](/images/toolkits/shared/sA0bvCBPtMCWw8lqecCrx76Dyc.webp)

8. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.

   ![OAuth client form with the Composio redirect URI under Authorized redirect URIs](/images/toolkits/shared/jDTS80dlfwHF6u1WAQhBdnjTrI.webp)

9. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

   ![OAuth client created dialog with the Client ID and Client secret](/images/toolkits/shared/YdKWAswsL2nVXnSbA4zgBUDmwA.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Analytics**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/DUtMN0UWIU2kEqnvS5DvD7qhWU.webp)

   ![Create Auth Config dialog with Google Analytics in the search results](/images/toolkits/google_analytics/select-google-analytics-toolkit.webp)

2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.

   ![Google Analytics auth config form with Client ID, Client secret, Redirect URI, and the analytics.readonly scope](/images/toolkits/google_analytics/auth-config-credentials.webp)

3. Open the auth config, select **Connect Account**, and sign in with the Google account you want to connect. Review the requested permissions before you continue.

   ![Google sign-in screen asking to share your name and profile picture](/images/toolkits/google_analytics/google-sign-in-profile.webp)

   ![Google consent screen asking to see and download your Google Analytics data](/images/toolkits/google_analytics/google-consent-screen.webp)

4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

   ![Composio auth config panel with the Google Analytics connected account shown as Active](/images/toolkits/google_analytics/connected-account-active.webp)

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/analytics.readonly`, `https://www.googleapis.com/auth/analytics`, `https://www.googleapis.com/auth/userinfo.profile`. `analytics.readonly` is enough to read reports. Editing configuration or managing users needs broader scopes and the matching Analytics role. See the [runReport reference](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

![Google hasn't verified this app notice for an app in Testing](/images/toolkits/shared/M0mS4XrLbK5mU52ry578MBa7M.webp)

If you change the requested scopes later, reconnect the account so the user grants the new access.
