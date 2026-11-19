## How do I set up custom OAuth credentials for Xero?

Composio has no managed OAuth app for Xero, so you need your own Xero app. It also lets you control the app name users see and the permissions your integration requests.

### Create the Xero app

1. Sign in to the [Xero Developer Portal](https://developer.xero.com/app/manage), open your apps, and click **New app**.

   ![Xero Developer Portal My Apps page with the New app button](/images/toolkits/xero/my-apps.webp)
2. Enter an **App name** and **Company or application URL**, and select the **Auth code** flow for a web app.

   ![Xero Add a new app form with Web app selected and the app details and redirect URI redacted](/images/toolkits/xero/new-app-form.webp)
3. Set the **Redirect URI** to `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config. Fill in the remaining required fields and click **Create app**.
4. Open the app's configuration and copy the **Client ID**. Click **Generate a secret** and copy the **Client Secret**.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Xero**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/xero/auth-configs.webp)

   ![Composio Create Auth Config dialog with Xero in the search results](/images/toolkits/xero/select-toolkit.webp)
2. Choose **Your Own Credentials** and paste the **Client id** and **Client secret**.

   ![Xero auth config form with Your Own Credentials selected and the Client id and Client secret fields](/images/toolkits/xero/own-credentials.webp)
3. Keep the default scopes or adjust them (see below), then click **Create Auth Config**.
4. Click **Connect Account**, sign in to Xero, check the app name, organisation, and permissions, and click **Allow access**.

   ![Saved Xero auth config with the Connect Account button](/images/toolkits/xero/connect-account.webp)

   ![Xero consent screen listing the requested permissions with an Allow access button](/images/toolkits/xero/consent.webp)
5. Open **Accounts** and confirm the connected account shows as **Active**. The auth config's **Enabled** label alone doesn't confirm a connection.

   ![Xero auth config Accounts tab with a connected account marked Active](/images/toolkits/xero/connected-account-active.webp)

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `openid`, `profile`, `email`, `offline_access`, plus read and write access to accounting, files, and projects (for example `accounting.invoices`, `accounting.contacts`, `accounting.payments`, and the `accounting.reports.*.read` scopes). Keep `offline_access` so Composio can refresh tokens without another sign-in, and remove any accounting areas your tools don't use.
