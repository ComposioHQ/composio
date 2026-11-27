## How do I set up custom OAuth credentials for Microsoft PowerPoint?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which permissions Microsoft PowerPoint requests.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.

   ![Azure App registrations page with the New registration button](/images/toolkits/shared/5uRKMRjmfWRjXAIPnkdZ8jDIX4.webp)

2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**) if you want to connect both work or school and personal accounts. Choose a single-tenant or multitenant organizational option if you only connect work or school accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.

   ![Entra Register an application form with Any Entra ID Tenant + Personal Microsoft accounts, the Web platform and the Composio redirect URI](/images/toolkits/microsoft_powerpoint/register-application.webp)

4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/microsoft_powerpoint/app-overview.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Certificates & secrets page with the New client secret button](/images/toolkits/microsoft_powerpoint/certificates-and-secrets.webp)

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/microsoft_powerpoint/add-client-secret.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID censored](/images/toolkits/microsoft_powerpoint/client-secret-value.webp)

7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Files.ReadWrite.All` (create, read, and edit presentations) and `offline_access` (refresh tokens). `User.Read` is already listed by default, then click **Add permissions**.

   ![API permissions page with the Add a permission button](/images/toolkits/microsoft_powerpoint/api-permissions.webp)

   ![Request API permissions panel with Microsoft Graph under Microsoft APIs](/images/toolkits/microsoft_powerpoint/microsoft-graph-api.webp)

   ![Microsoft Graph permission type choice with Delegated permissions](/images/toolkits/microsoft_powerpoint/delegated-permissions.webp)

   ![Microsoft Graph delegated permissions with Files.ReadWrite.All selected](/images/toolkits/microsoft_powerpoint/files-readwrite-all-permission.webp)

   ![Microsoft Graph delegated permissions with offline_access selected](/images/toolkits/microsoft_powerpoint/offline-access-permission.webp)

   ![Configured permissions list with Files.ReadWrite.All, offline_access and User.Read](/images/toolkits/microsoft_powerpoint/configured-permissions.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

![Entra Authentication page listing the Composio Web redirect URI](/images/toolkits/microsoft_powerpoint/registered-redirect-uri.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft PowerPoint**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/microsoft_powerpoint/composio-auth-configs.webp)

   ![Create Auth Config dialog with Microsoft PowerPoint selected](/images/toolkits/microsoft_powerpoint/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/microsoft_powerpoint/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio OAuth 2.0 form with empty Client id and Client secret fields and the v1 redirect URI](/images/toolkits/microsoft_powerpoint/composio-oauth-credentials.webp)

   ![Composio auth config with censored credentials and the v1 redirect URI](/images/toolkits/microsoft_powerpoint/composio-credentials-entered.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio scopes list with Files.ReadWrite.All and offline_access selected](/images/toolkits/microsoft_powerpoint/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Sign in with the Microsoft account you want to connect and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Microsoft PowerPoint auth config panel with the Connect Account button](/images/toolkits/microsoft_powerpoint/composio-connect-account.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/Ad4GMrYjKLi22dWKFlwp1NGTs.webp)

   ![Microsoft consent prompt for file access with organization consent unchecked](/images/toolkits/microsoft_powerpoint/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Auth config Accounts tab with the PowerPoint account showing Active](/images/toolkits/microsoft_powerpoint/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Files.ReadWrite.All` and `offline_access`. PowerPoint calls go through Microsoft Graph at `https://graph.microsoft.com/v1.0/`.

### Revoke access

- In Composio, delete the connected account from the auth config, or disable the auth config.
- In Microsoft, work or school users remove the app at [myapps.microsoft.com](https://myapps.microsoft.com/), and personal account users remove it at [account.microsoft.com/privacy/app-access](https://account.microsoft.com/privacy/app-access). This revokes PowerPoint's access.
