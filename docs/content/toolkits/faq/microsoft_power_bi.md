## How do I set up custom OAuth credentials for Microsoft Power BI?

Microsoft Power BI has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant).
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Open **API permissions**, click **Add a permission**, select **Power BI Service**, and choose **Delegated permissions**. Add `Dataset.Read.All`, `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `Content.Create`, and `Dataflow.Read.All`, or only the subset your workflow uses. Click **Add permissions**.
8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft Power BI**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.
3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Sign in with the work or school account you use for Power BI; its license and workspace access still apply. Review the consent prompt and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests the Power BI scopes `Dataset.Read.All`, `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `Content.Create`, and `Dataflow.Read.All`, each prefixed with `https://analysis.windows.net/powerbi/api/` (for example, `https://analysis.windows.net/powerbi/api/Workspace.Read.All`), plus `offline_access`. Listing workspaces needs only `Workspace.Read.All`. See Microsoft's [get groups](https://learn.microsoft.com/en-us/rest/api/power-bi/groups/get-groups) reference.
