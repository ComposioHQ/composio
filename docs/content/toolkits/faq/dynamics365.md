## How do I set up custom OAuth credentials for Dynamics 365?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which permissions Dynamics 365 requests.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant). Dynamics 365 requires a work or school account.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Open **API permissions**, click **Add a permission**, select **Dynamics CRM**, and choose **Delegated permissions**. Select `user_impersonation`, then click **Add permissions**. The signed-in user's Dynamics security roles still decide which records they can access.
8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Dynamics 365**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.
3. Under **Scopes**, keep `offline_access` and use **Add scope** to add the environment-specific Dynamics scope, which uses your full environment URL (for example, `https://yourorg.crm.dynamics.com/user_impersonation`). Click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Enter the organization name (`subdomain`) and environment host (`region`) from your Dynamics URL: for `https://yourorg.crm8.dynamics.com`, enter `yourorg` and `crm8.dynamics.com`. Sign in with a work or school account that has access to the environment, review the **Access Common Data Service as you** permission, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests only `offline_access`, so add the environment's `user_impersonation` scope yourself. See Microsoft's [OAuth with Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth) reference.

### Connection fields

- `subdomain` (required): the organization name from your environment URL, such as `myorg` in `https://myorg.crm8.dynamics.com`.
- `region`: the host suffix, such as `crm8.dynamics.com`. Keep `crm.dynamics.com` for the default public cloud. Use `crm.microsoftdynamics.us` for GCC High or `crm.dynamics.cn` for China.
- The connection's tenant field (`issuer`) defaults to `common`. To restrict sign-in to one tenant, set it to your **Directory (tenant) ID** from the app's **Overview** page or a verified tenant domain.
