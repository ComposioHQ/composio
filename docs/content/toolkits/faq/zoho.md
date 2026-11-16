## How do I set up custom OAuth credentials for Zoho CRM?

Use your own Zoho OAuth client when you want the consent screen to show your app name and to manage the client credentials yourself.

### Create the Zoho OAuth client

1. Sign in to the [Zoho API Console](https://api-console.zoho.com/) with the account you use for Zoho CRM. Use the console for your account's data center, for example `https://api-console.zoho.in/` for India.
2. Click **Add Client** (or **Get Started** for your first client) and choose **Server-based Applications**. Composio's callback is a backend endpoint, so a client-based app won't work. You can reuse an existing server-based client if it has the right redirect URI.
3. Enter a **Client Name** and a **Homepage URL**. Use your own product name: Zoho rejects client names that contain `ZOHO`.
4. In **Authorized Redirect URIs**, enter `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.
5. Click **Create**, then open the **Client Secret** tab and copy the **Client ID** and **Client Secret**.

   ![Zoho API Console Client Secret tab with the Client ID and Client Secret fields](/images/toolkits/zoho/client-secret.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Zoho CRM**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Client Secret.
3. Adjust the scopes if needed (see below) and click **Create Auth Config**.
4. Click **Connect Account**, enter your data center code in **Region**, and accept the permissions on Zoho's consent screen. Check that the account shows **Active**.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The Zoho API Console has no scope settings. Zoho takes scopes from the authorization request, so you set them in the auth config. The default auth config requests `ZohoCRM.modules.ALL`, `ZohoCRM.settings.ALL`, and `ZohoCRM.users.ALL`. Add or remove scopes to match the tools you use; extra scopes add to what the user has to approve. See Zoho's [CRM scope reference](https://www.zoho.com/crm/developer/docs/api/v8/select-api-scopes.html).

### Data center

**Region** is the ending of your Zoho web address when you're signed in: `com` for `zoho.com`, `eu` for `zoho.eu`, `in` for `zoho.in`, and so on. Enter the code only, not a full URL. If your app connects accounts in more than one data center, enable [multi-DC support](https://www.zoho.com/developer/oauth/web-server-apps/overview.html) for those regions on the client in the API Console.
