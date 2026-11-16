## How do I set up custom OAuth credentials for Azure Monitor Activity Log?

Azure Monitor Activity Log has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant). The account you connect must belong to a tenant the app allows.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/XrRJcE8kllnTRDHzOTTTl8s9oxc.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/eZiGGdUoPbOHKz4sCPqGdS04k.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID columns censored](/images/toolkits/shared/hiQJlSSKAljLV6UM2Wu8e5sUCzU.webp)

7. Open **API permissions**, click **Add a permission**, select **Azure Service Management** under **Microsoft APIs**, and choose **Delegated permissions**. Select `user_impersonation`, then click **Add permissions**. This permission lets the app act with the signed-in user's existing Azure rights. It doesn't create a log-reading role or narrow those rights.

   ![API permissions page with the Add a permission button](/images/toolkits/azure_monitor_activity_log/add-a-permission.webp)

   ![Request API permissions panel with Azure Service Management under Microsoft APIs](/images/toolkits/azure_monitor_activity_log/azure-service-management-api.webp)

   ![Azure Service Management delegated permissions with user_impersonation selected](/images/toolkits/azure_monitor_activity_log/user-impersonation-permission.webp)

   ![Configured user_impersonation permission details for Azure Service Management](/images/toolkits/azure_monitor_activity_log/user-impersonation-details.webp)

8. Keep **Allow public client flows** disabled on the **Authentication** page. This is a confidential Web client.
9. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Azure Monitor Activity Log**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/azure_monitor_activity_log/composio-auth-configs.webp)

   ![Create Auth Config dialog with Azure Monitor Activity Log selected](/images/toolkits/azure_monitor_activity_log/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/azure_monitor_activity_log/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio OAuth 2.0 form with empty Client id and Client secret fields and the v1 redirect URI](/images/toolkits/azure_monitor_activity_log/composio-oauth-credentials.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio auth config with the v1 redirect URI and the user_impersonation and offline_access scopes](/images/toolkits/azure_monitor_activity_log/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Enter the **Azure Subscription ID** (`generic_id`) and click **Connect Account**. Sign in with a Microsoft account that can read that subscription's Activity Log and accept the consent prompt. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Azure Monitor auth config page with the Connect Account button](/images/toolkits/azure_monitor_activity_log/composio-connect-account.webp)

   ![Composio connection form with the Azure Subscription ID field censored](/images/toolkits/azure_monitor_activity_log/subscription-id-field.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/WyfUBqcv3KROYF9jYs3rIFcs.webp)

   ![Microsoft consent prompt for Azure Resource Manager access with organization consent unchecked](/images/toolkits/azure_monitor_activity_log/microsoft-consent.webp)

   ![Composio page confirming the Azure Monitor Activity Log connection](/images/toolkits/azure_monitor_activity_log/connection-success.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the account showing Active](/images/toolkits/azure_monitor_activity_log/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://management.azure.com/user_impersonation` (Azure Resource Manager) and `offline_access` (refresh tokens). Azure RBAC still decides which subscription logs the account can read. See Microsoft's [Activity Logs - List](https://learn.microsoft.com/en-us/rest/api/monitor/activity-logs/list?view=rest-monitor-2015-04-01) reference.

### Find the subscription ID

In the Azure portal, open **Subscriptions**, select the subscription whose Activity Log you want, and copy **Subscription ID** from **Overview**. The signed-in user needs the `Microsoft.Insights/eventtypes/values/read` permission on that subscription, for example through the **Monitoring Reader** role.

![Azure Subscriptions list with the subscription ID and billing details censored](/images/toolkits/azure_monitor_activity_log/azure-subscriptions.webp)
