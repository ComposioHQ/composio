## How do I set up custom OAuth credentials for Microsoft Power BI?

Microsoft Power BI has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant).
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/XrRJcE8kllnTRDHzOTTTl8s9oxc.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/eZiGGdUoPbOHKz4sCPqGdS04k.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID columns censored](/images/toolkits/shared/hiQJlSSKAljLV6UM2Wu8e5sUCzU.webp)

7. Open **API permissions**, click **Add a permission**, select **Power BI Service**, and choose **Delegated permissions**. Add `Dataset.Read.All`, `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `Content.Create`, and `Dataflow.Read.All`, or only the subset your workflow uses. Click **Add permissions**.

   ![API permissions page with the Add a permission button](/images/toolkits/shared/O3hvEI521MXY1DbagDCQ8U3W2vo.webp)

   ![Request API permissions panel with Power BI Service under Microsoft APIs](/images/toolkits/microsoft_power_bi/power-bi-service-api.webp)

   ![Power BI Service delegated permissions with Workspace.Read.All selected](/images/toolkits/microsoft_power_bi/workspace-read-all-permission.webp)

   ![Configured permissions list on the app's API permissions page](/images/toolkits/microsoft_power_bi/configured-permissions.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

![Entra Authentication page listing the Composio Web redirect URI](/images/toolkits/microsoft_power_bi/registered-redirect-uri.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft Power BI**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/microsoft_power_bi/composio-auth-configs.webp)

   ![Create Auth Config dialog with Microsoft Power BI selected](/images/toolkits/microsoft_power_bi/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/microsoft_power_bi/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio OAuth 2.0 form with empty Client id and Client secret fields and the v1 redirect URI](/images/toolkits/microsoft_power_bi/composio-oauth-credentials.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio auth config with the v1 redirect URI and the Workspace.Read.All and offline_access scopes](/images/toolkits/microsoft_power_bi/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Sign in with the work or school account you use for Power BI; its license and workspace access still apply. Review the consent prompt and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Microsoft Power BI auth config panel with the Connect Account button](/images/toolkits/microsoft_power_bi/composio-connect-account.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/1dBnBBEYr17c671yWVLvqnS4k.webp)

   ![Microsoft consent prompt to view all workspaces with organization consent unchecked](/images/toolkits/microsoft_power_bi/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the Power BI account showing Active](/images/toolkits/microsoft_power_bi/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests the Power BI scopes `Dataset.Read.All`, `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `Content.Create`, and `Dataflow.Read.All`, each prefixed with `https://analysis.windows.net/powerbi/api/` (for example, `https://analysis.windows.net/powerbi/api/Workspace.Read.All`), plus `offline_access`. Listing workspaces needs only `Workspace.Read.All`. See Microsoft's [get groups](https://learn.microsoft.com/en-us/rest/api/power-bi/groups/get-groups) reference.
