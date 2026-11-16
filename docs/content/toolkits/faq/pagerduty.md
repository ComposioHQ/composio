## How do I set up custom OAuth credentials for PagerDuty?

Use your own PagerDuty OAuth app when you want the consent screen to show your app name and to keep the client credentials under your control.

### Create the PagerDuty app

You need the **Admin** or **Account Owner** role in PagerDuty to see **App Registration**.

1. Sign in to [PagerDuty](https://www.pagerduty.com/). In the top navigation, click **Integrations**, then under **Developer Tools** click **App Registration**. Don't pick **API Access Keys**; that page is for API keys.

   ![PagerDuty Integrations menu with App Registration under Developer Tools](/images/toolkits/pagerduty/integrations-menu.webp)

2. Click **+ New App**. Apps you register here stay private to your PagerDuty account unless you publish them, and private is what you want for Composio.

   ![PagerDuty App Registration page with the New App button](/images/toolkits/pagerduty/new-app.webp)

3. On **Info & Functionality**, enter a name and description. Under **Functionality**, check **OAuth 2.0**. Leave **Events Integration** unchecked unless you also need it. Click **Next**.

   ![PagerDuty Add New App form with name, description and OAuth 2.0 checked under Functionality](/images/toolkits/pagerduty/info-functionality.webp)

4. On **Configure OAuth 2.0**, choose **Classic User OAuth**. It acts on behalf of the signing-in user with broad read and write access, which matches the `read` and `write` scopes the auth config requests. **Scoped OAuth** gives per-resource permissions but doesn't match the default auth config.

   ![PagerDuty Configure OAuth 2.0 step with Classic User OAuth selected](/images/toolkits/pagerduty/classic-user-oauth.webp)

5. Set **Redirect URL** to `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.
6. Under **Permission Scope**, select **Read & Write**. PagerDuty shows the selected scope as `write`, which includes read.

   ![PagerDuty OAuth form with the Composio redirect URL and Read & Write permission scope](/images/toolkits/pagerduty/redirect-url-scope.webp)

7. Click **Register App**. PagerDuty shows the **Client ID** and **Client Secret** once, in a dialog. Copy both now. If you lose the secret, generate a new one and update the auth config.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **PagerDuty** with the **OAuth2** badge.
2. Choose your own credentials and paste the Client ID and Client Secret. Keep the redirect URI as the value you registered in PagerDuty. Click **Create Auth Config**.
3. Click **Connect Account**, enter a user ID, and sign in to PagerDuty with the account you want to connect.
4. If the user belongs to more than one PagerDuty account (subdomain), PagerDuty lists them. Pick the one whose incidents and services the agent should manage.
5. On the consent screen, check the app name and permissions, then click **Submit Consent**. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

PagerDuty also supports API key auth. Create the key under **Integrations** → **API Access Keys** and paste it when you connect the account.
