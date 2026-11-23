## How do I set up custom OAuth credentials for Microsoft Bookings?

Microsoft Bookings has no Composio-managed app, so you need your own Microsoft Entra ID app registration to connect it.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.
2. Enter a **Name**. Under **Supported account types**, choose an organizational option: **Accounts in this organizational directory only** (single tenant) or **Accounts in any organizational directory** (multitenant). Bookings doesn't support personal Microsoft accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.
4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/XrRJcE8kllnTRDHzOTTTl8s9oxc.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/eZiGGdUoPbOHKz4sCPqGdS04k.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID columns censored](/images/toolkits/shared/hiQJlSSKAljLV6UM2Wu8e5sUCzU.webp)

7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Bookings.Read.All`, `BookingsAppointment.ReadWrite.All`, `Bookings.ReadWrite.All`, `Bookings.Manage.All`, `offline_access`, and `User.Read`, or only the subset your workflow uses, then click **Add permissions**.

   ![API permissions page with the Add a permission button](/images/toolkits/shared/O3hvEI521MXY1DbagDCQ8U3W2vo.webp)

   ![Request API permissions panel with Microsoft Graph under Microsoft APIs](/images/toolkits/shared/P6j2HSVMJwSq5F11Whsyl5lgvM.webp)

   ![Microsoft Graph permission type choice with Delegated permissions](/images/toolkits/shared/SHZSEmH6MtzuytgGtV6w538oSZ8.webp)

   ![Microsoft Graph delegated permissions with Bookings.Read.All selected](/images/toolkits/microsoft_bookings/bookings-read-all-permission.webp)

   ![Configured permissions list with the Bookings.Read.All delegated permission](/images/toolkits/microsoft_bookings/configured-permissions.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **Microsoft Bookings**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/SKmiRvkpLj1fiXUXAPnkjJ2Ug.webp)

   ![Create Auth Config dialog with Microsoft Bookings selected](/images/toolkits/microsoft_bookings/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/microsoft_bookings/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown.

   ![Composio OAuth 2.0 form with empty Client id and Client secret fields and the v1 redirect URI](/images/toolkits/microsoft_bookings/composio-oauth-credentials.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio auth config with the v1 redirect URI and the Bookings.Read.All, offline_access and User.Read scopes](/images/toolkits/microsoft_bookings/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Keep **Microsoft Tenant** (`issuer`) as `organizations` to allow any work or school account, or enter your **Directory (tenant) ID** or a verified domain to restrict sign-in to one tenant. Click **Connect Account**, sign in with a work or school account that has Bookings enabled, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![Microsoft Bookings auth config panel with the Connect Account button](/images/toolkits/microsoft_bookings/composio-connect-account.webp)

   ![Composio connection form with Microsoft Tenant set to organizations](/images/toolkits/microsoft_bookings/microsoft-tenant-field.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/microsoft_bookings/microsoft-account-picker.webp)

   ![Microsoft consent prompt for reading bookings information with organization consent unchecked](/images/toolkits/microsoft_bookings/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the Microsoft Bookings account showing Active](/images/toolkits/microsoft_bookings/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Bookings.Read.All`, `BookingsAppointment.ReadWrite.All`, `Bookings.ReadWrite.All`, `Bookings.Manage.All`, `offline_access`, and `User.Read`. Listing booking businesses needs only `Bookings.Read.All`; appointment changes need more. See Microsoft's [list bookingBusinesses](https://learn.microsoft.com/en-us/graph/api/bookingbusiness-list?view=graph-rest-1.0) reference.
