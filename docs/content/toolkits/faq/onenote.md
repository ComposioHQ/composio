## How do I set up custom OAuth credentials for OneNote?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which permissions OneNote requests.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**) if you want to connect both work or school and personal accounts. Choose a single-tenant or multitenant organizational option if you only connect work or school accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Notes.ReadWrite` and `offline_access` (refresh tokens), plus any other OneNote scopes you'll select in Composio. `User.Read` is already listed by default, then click **Add permissions**.
8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **OneNote**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown. Keep **Microsoft cloud environment** (`microsoft_cloud`) set to `global` for commercial Microsoft 365, or set `gcc_high` for Microsoft 365 US Government GCC High. The app registration must live in that cloud.
3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Sign in with the Microsoft account you want to connect and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Notes.Read`, `Notes.ReadWrite`, `Notes.Create`, `Notes.Read.All`, `Notes.ReadWrite.All`, `Sites.Read.All`, `Team.ReadBasic.All`, `offline_access`, and `User.Read`. If your agent only reads notes, `Notes.Read` is enough. OneNote calls go through Microsoft Graph at `https://graph.microsoft.com/v1.0/me/onenote/`.

### Restrict sign-in to one tenant

The connection's tenant field (`issuer`) defaults to `common`. To restrict sign-in to one tenant, set it to your **Directory (tenant) ID** from the app's **Overview** page or a verified tenant domain.

### Revoke access

- In Composio, delete the connected account from the auth config, or disable the auth config.
- In Microsoft, work or school users remove the app at [myapps.microsoft.com](https://myapps.microsoft.com/), and personal account users remove it at [account.microsoft.com/privacy/app-access](https://account.microsoft.com/privacy/app-access). This revokes OneNote's access.
