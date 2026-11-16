## How do I set up custom OAuth credentials for Meta (Facebook)?

Use your own Meta app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Meta app

1. Sign in to [Meta for Developers](https://developers.facebook.com/) and register as a developer if you haven't. Your app must be linked to a [business portfolio](https://business.facebook.com/).
2. Click **Create App**. Enter the app details, select the use cases your workflow needs, and on the business step select your business portfolio. Complete the remaining fields and create the app.
3. In **App settings** > **Basic**, copy the **App ID** (client ID) and **App Secret** (client secret).
4. Add `https://backend.composio.dev/api/v1/auth-apps/add` to the app's OAuth redirect allow list (in **App settings** > **Advanced**, or **Valid OAuth Redirect URIs** in the Facebook Login settings). It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
5. Publish the app.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Facebook**.
2. Keep the authentication type as **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **App ID** as the **Client ID** and the **App Secret** as the **Client Secret**, then click **Create Facebook Auth Config**.
4. Click **Connect Account**, approve access in Facebook, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests `public_profile`, `email`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging`, and `read_insights`. Edit the **Scopes** field on the auth config to request only what you use. Meta requires App Review before people without a role on your app can grant most of these permissions.
