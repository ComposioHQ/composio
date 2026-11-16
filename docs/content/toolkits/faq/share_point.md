## How do I set up custom OAuth credentials for SharePoint?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which SharePoint permissions it requests. This applies to the **SharePoint** toolkit, which calls the SharePoint REST API; the separate **SharePoint Graph** toolkit uses Microsoft Graph permissions instead.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant). Allowing personal accounts doesn't give them access to an organizational SharePoint site.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.
5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.
6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.
7. Open **API permissions**, click **Add a permission**, select **SharePoint** (not Microsoft Graph), and choose **Delegated permissions**. Add the permissions your tools need, for example `AllSites.Read` for read-only access, and click **Add permissions**. Write, list-management, and admin operations can need more permissions and site or tenant roles.
8. Keep **Allow public client flows** disabled on the **Authentication** page. This is a confidential Web client.
9. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **SharePoint**. Enter a config name and click **Next**.
2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.
3. Under **Scopes**, keep the default `.default` and `offline_access` scopes. The `.default` scope picks up the SharePoint permissions you added in Azure. Click **Create Auth Config**.
4. Open the auth config and click **Connect Account**. Enter the **Tenant Name** (`subdomain`) and, optionally, the **SharePoint Subsite** (`generic_id`), then click **Connect Account**. Sign in with a work or school account that can access the site, check that the consent prompt shows your app's name, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.
5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://<tenant>.sharepoint.com/.default` (Composio fills in the tenant name you enter when connecting) and `offline_access`. The `.default` scope requests every permission configured on the app registration, not every SharePoint operation. If you reuse an app that has other API permissions, users and admins see those too, so review the full consent prompt. See Microsoft's [.default scope](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#the-default-scope) reference.

### Connection fields

- **Tenant Name** (`subdomain`, required): the part before `.sharepoint.com` in your site URL, such as `contoso` in `contoso.sharepoint.com`. Enter only the name, not a full URL or a tenant GUID.
- **SharePoint Subsite** (`generic_id`): leave it empty for the root site. A bare name such as `marketing` resolves to `/sites/marketing`. For nested subsites or other managed paths, enter the full path, such as `/sites/marketing/archive` or `/teams/engineering`.
- The connection's tenant field (`issuer`) defaults to `common`. To restrict sign-in to one tenant, set it to your **Directory (tenant) ID** from the app's **Overview** page or a verified tenant domain.

### App-only access (certificate)

SharePoint also supports an app-only auth mode (`S2S_OAUTH2`) that uses a certificate instead of a client secret. Upload the certificate under **Certificates & secrets** on the app registration, then enter the tenant ID (`generic_id`, a GUID from **Microsoft Entra ID** > **Overview**), the **Client id**, the RSA private key in PEM format (`private_key`), and the certificate's base64url-encoded SHA-256 thumbprint (`cert_thumbprint`). Connections take the same **Tenant Name** and optional site path.

## Why does my SharePoint `/teams/...` site resolve as `/sites/...`?

If a user's SharePoint site URL is under `/teams/<site>` instead of `/sites/<site>`, do not tell them to pass only `<site>` in the SharePoint Subsite field. A bare subsite value is interpreted as `/sites/<site>` by the toolkit.

Re-initiate or reconnect the SharePoint account and set SharePoint Subsite to the full server-relative path, for example `/teams/<site>`. For per-call overrides, pass `site_name: "/teams/<site>"`.
