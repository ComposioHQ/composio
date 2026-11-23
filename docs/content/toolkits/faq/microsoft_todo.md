## How do I set up custom OAuth credentials for Microsoft To Do?

Microsoft To Do has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**) if you want to connect both work or school and personal accounts. Choose a single-tenant or multitenant organizational option if you only connect work or school accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.

   ![Entra Register an application form with Any Entra ID Tenant + Personal Microsoft accounts, the Web platform and the Composio redirect URI](/images/toolkits/shared/1iIDmPCxFpXJP7zt73rUtnOLkxc.webp)

4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/XrRJcE8kllnTRDHzOTTTl8s9oxc.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/eZiGGdUoPbOHKz4sCPqGdS04k.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID columns censored](/images/toolkits/shared/hiQJlSSKAljLV6UM2Wu8e5sUCzU.webp)

7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Tasks.ReadWrite`, `User.Read`, `offline_access`, `openid`, and `profile`, then click **Add permissions**.

   ![API permissions page with the Add a permission button](/images/toolkits/shared/O3hvEI521MXY1DbagDCQ8U3W2vo.webp)

   ![Request API permissions panel with Microsoft Graph under Microsoft APIs](/images/toolkits/shared/P6j2HSVMJwSq5F11Whsyl5lgvM.webp)

   ![Microsoft Graph permission type choice with Delegated permissions](/images/toolkits/shared/SHZSEmH6MtzuytgGtV6w538oSZ8.webp)

   ![Microsoft Graph delegated permissions with Tasks.ReadWrite selected](/images/toolkits/microsoft_todo/tasks-readwrite-permission.webp)

   ![Configured permissions list after saving the Microsoft Graph permissions](/images/toolkits/microsoft_todo/configured-permissions.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft To Do**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/jkkvkcA7QbpyHuUXzLJNP0lvxLo.webp)

   ![Create Auth Config dialog with Microsoft To Do selected](/images/toolkits/microsoft_todo/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/microsoft_todo/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio OAuth 2.0 form with empty Client id and Client secret fields and the v1 redirect URI](/images/toolkits/microsoft_todo/composio-oauth-credentials.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio scopes list with Tasks.ReadWrite, User.Read, offline_access, openid and profile selected](/images/toolkits/microsoft_todo/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Sign in with the Microsoft account you use for To Do (work, school, or personal), review the requested task access, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Microsoft To Do auth config panel with the Connect Account button](/images/toolkits/microsoft_todo/composio-connect-account.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/19hfD30iOecyW2OUu49tHoR7H4.webp)

   ![Microsoft consent prompt for task access with organization consent unchecked](/images/toolkits/microsoft_todo/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the Microsoft To Do account showing Active](/images/toolkits/microsoft_todo/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Tasks.ReadWrite`, `User.Read`, `offline_access`, `openid`, and `profile`. For read-only access, use `Tasks.Read` instead of `Tasks.ReadWrite`. See Microsoft's [update todoTask](https://learn.microsoft.com/en-us/graph/api/todotask-update?view=graph-rest-1.0) reference.
