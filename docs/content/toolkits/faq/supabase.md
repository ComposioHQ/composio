## How do I set up custom OAuth credentials for Supabase?

Use your own Supabase OAuth app when you want to limit what the connection can do or show your app's name on the consent screen. The default Composio OAuth app may be configured with broader permissions, so scope limits belong in your own app.

### Create the Supabase app

1. Open your [Supabase organization](https://supabase.com/dashboard/organizations) and go to **Organization Settings**.
2. Click **Add Application** and fill in the form:
   - **Name**: for example, `Composio-Supabase`.
   - **Website URL**: your application's URL.
   - **Authorization Callback URL**: `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
3. Grant only the read and write permissions your tools need, then click **Create**.
4. Copy the **Client ID** and **Client Secret** from the page Supabase opens next.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Supabase**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer credentials**.
3. Paste the **Client ID** and **Client Secret**, then click **Create Supabase Auth Config**.
4. Click **Connect Account**. Keep the Supabase API URL at `https://api.supabase.com` unless you self-host Supabase.
5. Check that the consent screen lists only the permissions you granted the app, click **Authorize**, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The permissions you select in the Supabase app decide what the connection can access. Composio's auth config requests the `all` scope and can't narrow it further, so set the limits in Supabase.

### Use a personal access token instead

Supabase also supports API key authentication. Choose **API Key** as the authentication type, then on **Connect Account** paste a personal access token that starts with `sbp_`. Create one at [Account → Access Tokens](https://supabase.com/dashboard/account/tokens). Supabase shows it only once, so copy it right away.
