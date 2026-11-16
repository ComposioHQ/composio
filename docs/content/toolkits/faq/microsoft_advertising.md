## How do I set up custom OAuth credentials for Microsoft Advertising?

Microsoft Advertising has no Composio-managed app, so you need your own Microsoft Entra ID app registration and a production developer token to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**). Microsoft's Advertising app registration guide calls for this option, and Advertising accepts both work or school and personal Microsoft identities.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Keep **Allow public client flows** disabled on the **Authentication** page. This is a confidential Web client.
8. Sign in to [Microsoft Advertising developer settings](https://ads.microsoft.com/cc/Settings/DevSettings) with a Super Admin account and copy the production **Developer token** (request one if you don't have it). It is separate from the client secret. Sandbox tokens don't work with this toolkit. Don't regenerate a working token just to add another connection.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft Advertising**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.
3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Paste the production developer token (`generic_secret`), not the client secret, and click **Connect Account**. Sign in with the Microsoft identity that is already a user of the advertising account, complete any MFA, and review the consent prompt before accepting.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://ads.microsoft.com/msads.manage` and `offline_access`. The connected identity's Advertising account roles still decide what it can view or change. See Microsoft's [OAuth consent](https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth-consent?view=bingads-13) guide.

### Why do I get `AADSTS650052`?

For an organizational identity, Microsoft can require tenant-admin setup before Advertising authorization works. Ask the tenant admin to review the **Application behavior** section of Microsoft's Advertising app registration guide.
