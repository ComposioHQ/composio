## How do I set up custom OAuth credentials for OneDrive?

Use your own Microsoft Entra ID app registration when you want the Microsoft consent screen to show your app's name and you want to control which permissions OneDrive requests.

### Create the Microsoft Entra app

1. Sign in to the [Azure portal](https://portal.azure.com/), open **App registrations**, and click **New registration**.

   ![Azure App registrations page with the New registration button](/images/toolkits/shared/5uRKMRjmfWRjXAIPnkdZ8jDIX4.webp)

2. Enter a **Name**. Under **Supported account types**, choose **Accounts in any organizational directory and personal Microsoft accounts** (shown as **Any Entra ID Tenant + Personal Microsoft accounts**) if you want to connect both work or school and personal accounts. Choose a single-tenant or multitenant organizational option if you only connect work or school accounts.
3. Under **Redirect URI**, select the **Web** platform, enter `https://backend.composio.dev/api/v1/auth-apps/add`, and click **Register**.

   ![Entra Register an application form with Any Entra ID Tenant + Personal Microsoft accounts, the Web platform and the Composio redirect URI](/images/toolkits/shared/KZBDHtekgRetnjjIfoArkzSiZY.webp)

4. On the app's **Overview** page, copy the **Application (client) ID**.

   ![Entra app Overview page with the client, object and tenant IDs censored](/images/toolkits/shared/m3IgMHHfNa8gv1av1yK5u8y47Pg.webp)

5. Open **Certificates & secrets** and click **New client secret**. Add a description, choose an expiry that fits your rotation policy (for example, 180 days), and click **Add**. Rotate the secret before it expires.

   ![Certificates & secrets page with the New client secret button](/images/toolkits/shared/nDFU25pH9BfPuJzceax2NoFVzIw.webp)

   ![Add a client secret panel with a description and the 180-day expiry](/images/toolkits/shared/Ea7qmGPRdmtbyoxbuXiKG7bct1Q.webp)

6. Copy the secret **Value** right away. Use the **Value**, not the **Secret ID**. Azure shows the full value only once; if you lose it, create a new secret.

   ![Client secrets list with the Value and Secret ID censored](/images/toolkits/shared/wl7JybvARU75U43YShwhxk1Pgxk.webp)

7. Open **API permissions**, click **Add a permission**, select **Microsoft Graph**, and choose **Delegated permissions** so the app acts as the signed-in user. Add `Files.ReadWrite.All`, `Sites.ReadWrite.All`, and `offline_access`, or only the subset your workflow uses, then click **Add permissions**.

   ![API permissions page with the Add a permission button](/images/toolkits/shared/BOmH98f2n8W8w0fbYP6WUJ1mFII.webp)

   ![Request API permissions panel with Microsoft Graph selected](/images/toolkits/shared/J4V5TpgIBuXDk4prikxhduGZQxM.webp)

   ![Microsoft Graph permission type choice with Delegated permissions](/images/toolkits/shared/9cVvSnHVsreVO2KBW80wvMy50Bo.webp)

8. If your tenant restricts user consent, have a tenant admin click **Grant admin consent for** your tenant on the **API permissions** page. Adding a permission to the app registration doesn't grant consent by itself.

The redirect URI you register must exactly match the `oauth_redirect_uri` field in your Composio auth config (default `https://backend.composio.dev/api/v1/auth-apps/add`).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create**, and select **OneDrive**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/10qkqAzadRISRYZhaXXdhXA.webp)

   ![Create Auth Config dialog with OneDrive selected](/images/toolkits/one_drive/composio-toolkit-picker.webp)

   ![Auth config name field with the Next button](/images/toolkits/one_drive/composio-config-name.webp)

2. Select **OAuth 2.0** and **Your Own Credentials**. Paste the Application (client) ID into **Client id** and the secret value into **Client secret**. Leave **Redirect URI** as shown. Keep **Microsoft cloud environment** (`microsoft_cloud`) set to `global` for commercial Microsoft 365, or set `gcc_high` for Microsoft 365 US Government GCC High. The app registration must live in that cloud.

   ![Composio auth config form with OAuth 2.0 and Your Own Credentials selected](/images/toolkits/one_drive/composio-own-credentials.webp)

   ![Composio auth config with empty credential fields, the v1 redirect URI and Microsoft cloud environment set to global](/images/toolkits/one_drive/composio-credentials-cloud.webp)

3. Under **Scopes**, select the same permissions you added in Azure, then click **Create Auth Config**.

   ![Composio scopes list with Files.ReadWrite.All, Sites.ReadWrite.All and offline_access selected](/images/toolkits/one_drive/composio-scopes.webp)

4. Open the auth config and click **Connect Account**. Sign in with the account whose OneDrive you want to use, check that the consent prompt shows your app's name, and click **Accept**. Leave **Consent on behalf of your organization** unchecked unless you're an admin granting tenant-wide consent. An **unverified** label is expected for a custom app without a verified publisher.

   ![OneDrive auth config panel with the Connect Account button](/images/toolkits/one_drive/composio-connect-account.webp)

   ![Microsoft Pick an account page with the accounts censored](/images/toolkits/shared/Ad4GMrYjKLi22dWKFlwp1NGTs.webp)

   ![Microsoft consent prompt for file and site access with organization consent unchecked](/images/toolkits/one_drive/microsoft-consent.webp)

5. Back on the auth config's **Connected Accounts** tab, confirm the account shows **Active**. The **Enabled** label at the top of the page describes the auth config, not the account.

   ![Connected Accounts tab with the OneDrive account showing Active](/images/toolkits/one_drive/connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `Files.ReadWrite.All`, `Sites.ReadWrite.All`, and `offline_access`. Basic file reads need only `Files.Read`, and file edits need `Files.ReadWrite`. Shared files and SharePoint-backed items need the broader permissions. See Microsoft's [get driveItem](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0) reference.

### Restrict sign-in to one tenant

The connection's tenant field (`issuer`) defaults to `common`. To restrict sign-in to one tenant, set it to your **Directory (tenant) ID** from the app's **Overview** page or a verified tenant domain.

### App-only access (client credentials)

OneDrive also supports an app-only auth mode (`S2S_OAUTH2`) that runs without a signed-in user. It takes the **Client id**, the **Client secret** value, and your Microsoft Entra **tenant ID** (`generic_id`) as a GUID, found under **Microsoft Entra ID** > **Overview** > **Tenant ID**. For this mode, add **Application permissions** instead of delegated permissions on the app registration, and have an admin grant admin consent.

## Why am I getting 404 on `ONE_DRIVE_DOWNLOAD_FILE` for a shared file?

Items in "Shared" may be references to files stored in SharePoint, not actual files in the user's OneDrive. These references can't be downloaded via OneDrive endpoints.

To fix this, open the file's location in OneDrive or SharePoint, choose "Copy to" then "My files" to create a copy in the user's OneDrive, and download the copy. If you need programmatic access to SharePoint files, use the SharePoint APIs instead.
