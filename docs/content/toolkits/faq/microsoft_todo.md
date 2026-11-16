## How do I set up custom OAuth credentials for Microsoft To Do?

Microsoft To Do has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**) if you want to connect both work or school and personal accounts. Choose a single-tenant or multitenant organizational option if you only connect work or school accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Tasks.ReadWrite`, `User.Read`, `offline_access`, `openid`, and `profile`, then click **Add permissions**.
8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft To Do**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.
3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Sign in with the Microsoft account you use for To Do (work, school, or personal), review the requested task access, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Tasks.ReadWrite`, `User.Read`, `offline_access`, `openid`, and `profile`. For read-only access, use `Tasks.Read` instead of `Tasks.ReadWrite`. See Microsoft's [update todoTask](https://learn.microsoft.com/en-us/graph/api/todotask-update?view=graph-rest-1.0) reference.
