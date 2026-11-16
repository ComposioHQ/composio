## Why do I see "App is not installed" when connecting Monday?

Monday requires the OAuth app to be installed in the target workspace before users can authorize their accounts. If the app is not installed, Monday can stop the connection flow with an "App is not installed" message.

![Monday authorization screen showing that the app is not installed before authorization can continue.](/images/kb/toolkits/monday/monday-app-not-installed.png)

A Monday workspace admin only needs to install the app once per workspace. After the admin approves the installation, users in that workspace can connect their Monday accounts normally.

If you are using the Composio-managed Monday app, ask a Monday workspace admin to install it with this link: `https://auth.monday.com/oauth2/authorize?client_id=96b038435fc029e045f9ba800e66fefa&response_type=install`.

We are working on making this flow smoother so developers do not need to manually share the install link.

## How do I set up custom OAuth credentials for Monday.com?

Use your own Monday app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Monday app

1. Sign in to the [Monday developer center](https://monday.com/developers/apps) and click **Create App**.
2. Give the app a name, such as `Composio-Monday`. Monday generates a **Client ID**, **Client Secret**, and **Signing Secret** at the bottom of the page. Copy all three.

   ![Monday app General settings with the app name Composio-Monday](/images/toolkits/monday/general-settings.webp)

   ![Monday App Credentials with redacted Client ID and hidden Client Secret and Signing Secret](/images/toolkits/monday/app-credentials.webp)
3. In the app's **Redirect URLs** section, add `https://backend.composio.dev/api/v1/auth-apps/add` with `https` and no trailing slash. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
4. Select the scopes your integration needs, such as `boards:read`, `boards:write`, `workspaces:read`, `users:read`, and `me:read`.

   ![Monday OAuth & permissions Scopes tab listing OAuth scopes](/images/toolkits/monday/oauth-scopes.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Monday**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)
2. Set the authentication type to **OAuth2** (not Bearer Token) and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**. If **New OAuth Flow** is enabled for your Monday app, set `use_oauth2_1` to `true`; leave it `false` for legacy OAuth 2.0. To use Monday triggers, paste the app's Signing Secret into `webhook_signing_secret` (it's not the Client Secret). Then click **Create Monday Auth Config**.
4. Have a Monday workspace admin install your app in the workspace (see the "App is not installed" question above). Then click **Connect Account**, authorize, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow. After the OAuth flow completes, Composio stores the access token automatically.

## How do Monday scopes work?

Monday scopes are configured on the Monday OAuth app and picked up during authorization. For the common connection flow, you do not need to configure scopes separately in the auth config.

If you are using the Composio-managed Monday app, use the default scope setup. If you are creating your own Monday OAuth app, configure the scopes you need in Monday. If you intentionally want to request only a subset of the OAuth app's scopes, configure that subset in the auth config; otherwise, leave the auth config scope field alone.
