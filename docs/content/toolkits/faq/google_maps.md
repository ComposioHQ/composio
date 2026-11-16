## How do I set up custom Google OAuth credentials for Google Maps?

Use your own Google OAuth app when you want your app name on the consent screen, your own API quota, or full control over the requested scopes.

Use a Google Cloud project with Maps billing enabled, and confirm your team is allowed to use that project's Maps quota.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.
2. Open **APIs & Services** → **Library**, search for **Places API (New)** (`places.googleapis.com`), and select **Enable**. If the page shows **Manage**, the API is already enabled. Composio uses it to check the connection.
3. If your workflow computes routes, also enable **Routes API** (`routes.googleapis.com`). Check Google's [authentication requirements](https://developers.google.com/maps/documentation/places/web-service/get-api-key) for each Maps endpoint you use.
4. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.
5. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.
6. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.
7. Open **Clients** → **Create client**, choose **Web application**, and give it a name.
8. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.
9. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Maps**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in. The connection check looks up a place through Places API (New), which can count toward Maps usage. Google requires a billing-enabled quota project for OAuth requests, so if Google rejects the connection, check API enablement, quota-project permissions, and billing.
4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests `https://www.googleapis.com/auth/cloud-platform`. Google requires it for OAuth requests to Places API (New) and Routes API. It can grant broad access to any Google Cloud resources the signed-in user can reach, so review that user's project permissions before you connect.

### Use an API key instead

Google Maps also supports an API key connection. Create a key in Google Cloud Console under **APIs & Services** → **Credentials** in a project with the Maps APIs and billing enabled, then paste it (it starts with `AIza`) when you connect the account. Some tools, such as the Maps Embed API, work only with an API key (see below).

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.

## Why am I seeing "App is blocked" when connecting Google Maps?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or use your own OAuth app and submit those scopes for Google verification. The setup and verification steps are under **How do I set up custom Google OAuth credentials for Google Maps?** above.

## Why am I getting "Google Maps API has not been used in project" error?

When using custom OAuth credentials, the Google Maps API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## What is required for the Maps Embed API?

`GOOGLE_MAPS_MAPS_EMBED_API` is API-key based. Google's Maps Embed API requires an API key on each request; OAuth2 is not the auth path for this tool.

You must use an API-key connection to use this tool.
