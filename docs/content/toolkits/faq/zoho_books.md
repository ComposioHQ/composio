## How do I set up custom OAuth credentials for Zoho Books?

Use your own Zoho OAuth client when you want the consent screen to show your app name and to manage the client credentials yourself. You need access to an existing Zoho Books organization.

### Create the Zoho OAuth client

1. Sign in to the [Zoho API Console](https://api-console.zoho.com/) with the account you use for Zoho Books. Use the console for your account's data center, for example `https://api-console.zoho.in/` for India.
2. Click **Add Client** (or **Get Started** for your first client) and choose **Server-based Applications** → **Create Now**. You can reuse an existing server-based client if it has the right redirect URI.

   ![Zoho API Console client type picker with Server-based Applications](/images/toolkits/shared/NPebZadjeI4xIhtObtt8Fou0hs.webp)

3. Enter a **Client Name** and a **Homepage URL**. Use your own product name: Zoho rejects client names that contain `ZOHO`.
4. In **Authorized Redirect URIs**, enter `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.

   ![Zoho API Console Create New Client form with the Composio redirect URI](/images/toolkits/shared/8KdDacyTQMo8T6CGQiwoDnYz7WU.webp)

5. Click **Create**, then open the **Client Secret** tab and copy the **Client ID** and **Client Secret**.

   ![Zoho API Console Client Secret tab with the Client ID and Client Secret (redacted)](/images/toolkits/shared/mOoTcq0Tv58rR84sOt4c4MqcWgM.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-zoho_books), go to **Auth Configs** → **Create** and select **Zoho Books**.

2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Client Secret. Leave **Redirect URI** as the value you registered in Zoho.

3. In **Scopes**, keep only what your workflow needs. To add a scope that isn't listed, type its exact name and click **Add scope**. Click **Create Auth Config**.

4. Click **Connect Account** and enter your data center code in **Domain Extension** (see below).

   ![Composio Connect Account form with a data center code in Domain Extension](/images/toolkits/zoho_books/data-center.webp)

5. Sign in to Zoho, review the app name, organization, and permissions, tick the consent checkbox if shown, and click **Accept**. Then open the auth config's **Accounts** tab and check that the account shows **Active**. The config showing **Enabled** doesn't mean an account is connected.

   ![Zoho consent screen for Zoho Books with the consent checkbox and Accept button](/images/toolkits/zoho_books/consent-screen.webp)

   ![Zoho Books auth config Accounts tab with the connected account Active](/images/toolkits/zoho_books/account-active.webp)

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

Zoho takes scopes from the authorization request, so you set them in the auth config, not in the API Console. The default auth config requests `ZohoBooks.fullaccess.all`. For a read-only check of organization and user details, `ZohoBooks.settings.READ` is enough. Check each tool against the [Zoho Books API reference](https://www.zoho.com/books/api/v3/introduction/).

If you add scopes later, reconnect the account. An existing connection doesn't pick up new permissions.

### Data center

**Domain Extension** is the ending of your Zoho Books web address: `com` for `books.zoho.com`, `eu` for `books.zoho.eu`, `in` for `books.zoho.in`, `au` for `books.zoho.com.au`. Other options are `jp`, `ca`, `cn`, and `sa`. Enter the code only, not a full URL. The client's data center and the account's data center must be compatible. If your app connects accounts in more than one data center, enable [multi-DC support](https://www.zoho.com/developer/oauth/web-server-apps/overview.html) for those regions on the client in the API Console.

### Troubleshooting

- **Redirect mismatch**: compare the full callback URL in Zoho and in Composio, including the path.
- **Invalid client or data center error**: check the API Console's data center, the account's data center, and **Domain Extension**.
- **Permission or organization error**: check that the user can access the Zoho Books organization and that the auth config requests the scope the tool needs.
