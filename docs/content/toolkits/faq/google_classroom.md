## How do I set up custom Google OAuth credentials for Google Classroom?

Use your own Google OAuth app when you want your app name on the consent screen, your own API quota, or full control over the requested scopes.

Connect with a Google account that has Classroom access. Course access follows the user's Classroom role, and some advanced features need specific Education licenses.

### Create the Google OAuth app

1. In [Google Cloud Console](https://console.cloud.google.com/), select the project that will own the OAuth client, or create one.
2. Open **APIs & Services** → **Library**, search for **Google Classroom API** (`classroom.googleapis.com`), and select **Enable**. If the page shows **Manage**, the API is already enabled. See Google's [Classroom API setup](https://developers.google.com/workspace/classroom/guides/get-started).
3. Open **Google Auth Platform** → **Branding**. If Google shows **Get started**, enter the app name, user support email, and developer contact email, then save.
4. Open **Audience**. Choose **Internal** to limit the app to users in your Google Workspace organization, or **External** for consumer accounts and users outside it. While an external app's publishing status is **Testing**, only accounts listed under **Test users** can connect, so add every account you'll test with.
5. Open **Data Access** → **Add or remove scopes** and add the scopes listed under **Scopes** below. If a scope isn't in the list, paste its full URL under **Manually add scopes** and select **Add to table**. Select **Update**, then **Save**.
6. Open **Clients** → **Create client**, choose **Web application**, and give it a name.
7. Under **Authorized redirect URIs**, add `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the `oauth_redirect_uri` field on your Composio auth config.
8. Select **Create**. Copy the **Client ID** and **Client secret**. Google shows the full secret only once, so save it before you close the dialog.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), open **Auth Configs** → **Create** and select **Google Classroom**.
2. Choose **OAuth 2.0** and **Your Own Credentials**, then paste your **Client ID** and **Client secret**. Leave **Redirect URI** unchanged, keep the scopes in line with what you added in Google, and select **Create Auth Config**.
3. Open the auth config, select **Connect Account**, and sign in with the Google account you want to connect. Review the requested permissions before you continue.
4. Open **Accounts** on the auth config and confirm the connected account shows **Active**. The auth config's own **Enabled** label doesn't confirm a connection.

For the general flow, see [Custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default auth config requests these scopes under `https://www.googleapis.com/auth/`: `classroom.courses.readonly`, `classroom.coursework.students`, `classroom.courseworkmaterials`, `classroom.topics`, `classroom.rosters.readonly`, `classroom.announcements`, and `classroom.course-work`. Keep `classroom.rosters.readonly`: Composio uses it to check the signed-in Classroom profile. It lets the app view rosters but not change them. For read-only use, `classroom.courses.readonly` plus `classroom.rosters.readonly` is enough. See Google's [Classroom scope reference](https://developers.google.com/workspace/classroom/guides/auth).

### Publish and verify the app

While an external app is in **Testing**, Google shows an unverified-app notice and refresh tokens expire after seven days, so users have to reconnect. Before you invite production users, select **Publish app** on the **Audience** page. A public app that requests sensitive or restricted scopes also needs Google's OAuth verification, which you start from **Verification Center**. Publishing doesn't complete verification on its own. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

If you change the requested scopes later, reconnect the account so the user grants the new access.

## Why am I seeing "App is blocked" when connecting Google Classroom?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or use your own OAuth app and submit those scopes for Google verification. The setup and verification steps are under **How do I set up custom Google OAuth credentials for Google Classroom?** above.

## Why am I getting "Google Classroom API has not been used in project" error?

When using custom OAuth credentials, the Google Classroom API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.
