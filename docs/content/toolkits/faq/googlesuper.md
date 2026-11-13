## How do I set up custom Google OAuth credentials for Google Super?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Super?

Google can block consent when the OAuth client requests scopes that Google hasn't approved for that client. Follow [Google scope approvals and blocked-app troubleshooting](/docs/authentication/controlling-scopes#google-scope-approvals) to check the auth config and requested scopes. Toolkit defaults and scope recommendations don't establish the managed app's approved scopes.

If a required scope isn't approved for the managed app, use your own Google OAuth app with the required verification and reconnect through a custom auth config. See [Managed vs custom auth](/docs/authentication/custom-app-vs-managed-app) and [Google OAuth setup](https://composio.dev/auth/googleapps).

## Why am I getting the "API has not been used in project" error?

When using custom OAuth credentials, the required Google API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).
