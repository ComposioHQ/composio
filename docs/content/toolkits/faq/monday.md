## Why do I see "App is not installed" when connecting Monday?

Monday requires the OAuth app to be installed in the target workspace before users can authorize their accounts. If the app is not installed, Monday can stop the connection flow with an "App is not installed" message.

![Monday authorization screen showing that the app is not installed before authorization can continue.](/images/kb/toolkits/monday/monday-app-not-installed.png)

A Monday workspace admin only needs to install the app once per workspace. After the admin approves the installation, users in that workspace can connect their Monday accounts normally.

If you are using the Composio-managed Monday app, ask a Monday workspace admin to install it with this link: `https://auth.monday.com/oauth2/authorize?client_id=96b038435fc029e045f9ba800e66fefa&response_type=install`.

We are working on making this flow smoother so developers do not need to manually share the install link.

## How do I set up custom OAuth credentials for Monday.com?

For a step-by-step guide on creating and configuring your own Monday.com OAuth credentials, see [How to create OAuth2 credentials for Monday](https://composio.dev/auth/monday).

For a custom Monday OAuth app, add the Composio redirect URL/callback URL to the Monday app settings. After the OAuth flow completes, the access token is populated automatically.

## How do Monday scopes work?

Monday scopes are configured on the Monday OAuth app and picked up during authorization. For the common connection flow, you do not need to configure scopes separately in the auth config.

If you are using the Composio-managed Monday app, use the default scope setup. If you are creating your own Monday OAuth app, configure the scopes you need in Monday. If you intentionally want to request only a subset of the OAuth app's scopes, configure that subset in the auth config; otherwise, leave the auth config scope field alone.
