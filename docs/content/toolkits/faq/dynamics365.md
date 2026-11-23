## How do I set up custom OAuth credentials for Dynamics 365?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which permissions Dynamics 365 requests.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant). Dynamics 365 requires a work or school account.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/XrRJcE8kllnTRDHzOTTTl8s9oxc.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/eZiGGdUoPbOHKz4sCPqGdS04k.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID columns censored](/images/toolkits/shared/hiQJlSSKAljLV6UM2Wu8e5sUCzU.webp)

7. Open **API permissions**, click **Add a permission**, select **Dynamics CRM**, and choose **Delegated permissions**. Select `user_impersonation`, then click **Add permissions**. The signed-in user's Dynamics security roles still decide which records they can access.

   ![API permissions page with the Add a permission button](/images/toolkits/shared/O3hvEI521MXY1DbagDCQ8U3W2vo.webp)

   ![Request API permissions panel with Dynamics CRM under Microsoft APIs](/images/toolkits/dynamics365/dynamics-crm-api.webp)

   ![Dynamics CRM delegated permissions with user_impersonation selected](/images/toolkits/dynamics365/user-impersonation-permission.webp)

   ![Configured permissions list with the Dynamics CRM user_impersonation permission](/images/toolkits/dynamics365/configured-permissions.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Dynamics 365**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/dynamics365/composio-auth-configs.webp)

   ![Create Auth Config dialog with Dynamics 365 selected](/images/toolkits/dynamics365/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/dynamics365/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio auth config form with OAuth 2.0 and Your Own Credentials selected](/images/toolkits/dynamics365/composio-own-credentials.webp)

3. Under **Scopes**, keep `offline_access` and use **Add scope** to add the environment-specific Dynamics scope, which uses your full environment URL (for example, `https://yourorg.crm.dynamics.com/user_impersonation`). Click **Create Auth Config**.

   ![Composio scopes list with offline_access selected and a censored environment-specific scope added](/images/toolkits/dynamics365/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Enter the organization name (`subdomain`) and environment host (`region`) from your Dynamics URL: for `https://yourorg.crm8.dynamics.com`, enter `yourorg` and `crm8.dynamics.com`. Sign in with a work or school account that has access to the environment, review the **Access Common Data Service as you** permission, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Composio connection form with the Dynamics 365 organization name and environment host fields](/images/toolkits/dynamics365/connection-fields.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/1dBnBBEYr17c671yWVLvqnS4k.webp)

   ![Microsoft consent prompt with Access Common Data Service as you and organization consent unchecked](/images/toolkits/dynamics365/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the Dynamics account showing Active](/images/toolkits/dynamics365/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests only `offline_access`, so add the environment's `user_impersonation` scope yourself. See Microsoft's [OAuth with Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth) reference.

### Connection fields

- `subdomain` (required): the organization name from your environment URL, such as `myorg` in `https://myorg.crm8.dynamics.com`.
- `region`: the host suffix, such as `crm8.dynamics.com`. Keep `crm.dynamics.com` for the default public cloud. Use `crm.microsoftdynamics.us` for GCC High or `crm.dynamics.cn` for China.
- The connection's tenant field (`issuer`) defaults to `common`. To restrict sign-in to one tenant, set it to your **Directory (tenant) ID** from the app's **Overview** page or a verified tenant domain.
