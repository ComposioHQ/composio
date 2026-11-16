## How do I set up custom OAuth credentials for Zoho Mail?

Use your own Zoho OAuth client when you want the consent screen to show your app name and to manage the client credentials yourself. You need an existing Zoho Mail account.

### Create the Zoho OAuth client

1. Sign in to the [Zoho API Console](https://api-console.zoho.com/). Click **Add Client** (or **Get Started** for your first client).
2. Choose **Server-based Applications** and click **Create Now**. See Zoho's [client registration guide](https://www.zoho.com/developer/oauth/register-app.html).
3. Enter a **Client Name** and your application's **Homepage URL**. Use your own product name: Zoho rejects client names that contain `ZOHO` with "Client name should not contain ZOHO".
4. In **Authorized Redirect URIs**, enter `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.
5. Click **Create**, then open the **Client Secret** tab and copy the **Client ID** and **Client Secret**.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Zoho Mail**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste the Client ID and Client Secret. Leave **Redirect URI** as the value you registered in Zoho.
3. Enter the scopes your workflow needs (see below) and click **Create Auth Config**. To add a scope that isn't listed, type its exact name and click **Add scope**.
4. Click **Connect Account** and enter the account's data center code in **Domain Extension** (see the region question below).
5. Sign in to Zoho Mail, review the app name and permissions, tick the consent checkbox, and click **Accept**. Then open the auth config's **Accounts** tab and check that the account shows **Active**. The config showing **Enabled** doesn't mean an account is connected.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests no scopes, but Zoho requires scope names in the authorization request, so add the ones your tools need. Scope names are case-sensitive. Common ones:

- `ZohoMail.accounts.READ`: list the user's mail accounts
- `ZohoMail.messages.READ`: read messages
- `ZohoMail.messages.CREATE`: send messages

See the [Zoho Mail API reference](https://www.zoho.com/mail/help/api/) for the scope each operation needs.

### Troubleshooting

- **Invalid client or region error**: check the client's data center, the account's data center, and **Domain Extension**.
- **Invalid scope**: use the exact, case-sensitive Zoho Mail scope names.
- **Redirect mismatch**: compare the full callback URL in Zoho and in Composio, including the path.

## What should I pass for the correct Zoho region when connecting Zoho Mail?

Enter the code from your Zoho Mail web address in **Domain Extension**. Zoho accounts live in one data center, so an EU or other regional account fails if you connect with the default `com`.

- `mail.zoho.com`: `com`
- `mail.zoho.eu`: `eu`
- `mail.zoho.in`: `in`
- `mail.zoho.com.au`: `au`
- `mail.zohocloud.ca`: `ca`
- `mail.zoho.com.cn`: `cn`
- `mail.zoho.jp`: `jp`
- `mail.zoho.ae`: `ae`
- `mail.zoho.sa`: `sa`

Enter the code only, not a full URL. If your app connects users in data centers other than the one where you registered the client, enable [multi-DC support](https://www.zoho.com/developer/oauth/web-server-apps/overview.html) in the API Console. See Zoho's [Mail data center list](https://www.zoho.com/mail/help/api/getting-started-with-api.html).
