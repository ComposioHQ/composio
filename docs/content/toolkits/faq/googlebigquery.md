## How do I set up custom Google OAuth credentials for Google BigQuery?

Use your own Google OAuth app for production BigQuery connections. Composio's managed OAuth app is still waiting on Google verification for the BigQuery scope, so Google can block it (see the next question).

The Google account you connect needs IAM access to the BigQuery projects and datasets your workflow uses. For basic exploration, Google offers a limited [BigQuery sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox) that doesn't need a billing account.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.

   ![Google Cloud console project picker](/images/toolkits/shared/9j8wjr2HocIhIsgedntpgb4m8Y.webp)

2. Open **APIs & Services** → **Library**, search for **BigQuery API** (`bigquery.googleapis.com`), and select **Enable**. If the page shows **Manage**, the API is already enabled.
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

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-googlebigquery), open **Auth Configs** → **Create** and select **Google BigQuery**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in with the Google account you want to connect. Review the requested permissions before you continue.

   ![Google consent screen asking to view your data in Google BigQuery](/images/toolkits/googlebigquery/google-consent-screen.webp)

4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

   ![Composio auth config panel with the Google BigQuery connected account shown as Active](/images/toolkits/googlebigquery/connected-account-active.webp)

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/cloud-platform`, `https://www.googleapis.com/auth/userinfo.email`. Composio uses `userinfo.email` to identify the connected account, so keep it. To list projects with less access, you can use `https://www.googleapis.com/auth/bigquery.readonly` with `userinfo.email` instead. Add job or data-write scopes only if your workflow runs queries or loads data. See Google's [projects.list reference](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/projects/list) for the required permissions.

Short scope names on this page leave out the `https://www.googleapis.com/auth/` prefix. When you paste a scope under **Manually add scopes**, use the full URL, for example `https://www.googleapis.com/auth/userinfo.email`. Scopes already written as a full URL, such as `https://mail.google.com/`, go in as shown.

### IAM, billing, and missing projects

OAuth scopes and Google Cloud IAM both apply. If a project or dataset is missing after you connect, check the signed-in user's IAM roles. Review BigQuery pricing and job permissions before you run queries or load data.

### Use a service account instead

BigQuery also supports the **Google Service Account** auth scheme, which skips the user consent screen. Create an auth config with that scheme, then paste the service account's credentials JSON in the `credentials_json` field when you connect the account.

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.

## Why do I see "This app is blocked" when connecting Google BigQuery?

Google can show "This app is blocked" during the BigQuery OAuth flow when the OAuth app requests Google scopes that are not approved or verified for that app.

For managed Google BigQuery OAuth, this can happen because Composio's managed OAuth app does not yet have the required BigQuery scope approved. That scope is still under verification, which is why Google can block the connection.

To unblock production usage, use your own verified Google OAuth app in a custom auth config with the BigQuery scopes your workflow needs, then reconnect the account. If your setup can use service-account auth for BigQuery, that can also avoid the user-consent OAuth screen.
