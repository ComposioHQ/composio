Use this guide to choose managed or customer-owned Google OAuth for Google Classroom and troubleshoot consent, scope, or token failures.

## Configure Google OAuth for Google Classroom

**Follow the Google Apps credential setup guide for custom OAuth.** For a step-by-step guide to creating and configuring Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

**Enable the Google Classroom API for custom OAuth.** Enable the Google Classroom API in the Google Cloud project that owns the credentials. After enabling it under **APIs & Services**, wait a few minutes and retry.

**Choose managed or customer-owned OAuth.** Use Composio-managed OAuth for the standard connection flow. Use a custom Google OAuth app when you need control over scopes, consent-screen branding, or Google Cloud project policy. For custom OAuth, configure the app name and branding in that project and use the redirect URL shown by Composio's current auth-config flow.

## Troubleshoot Google Classroom OAuth and tool calls

**Remove unverified scopes when Google reports “App is blocked.”** This error usually means the OAuth client is requesting scopes that Google has not verified for that client. Remove additional scopes beyond the defaults, or use a custom OAuth app and submit the scopes for verification.

**Validate scopes when OAuth returns `Error 400: invalid_scope`.** Verify the requested scopes and their formatting against the [Google OAuth scopes documentation](https://developers.google.com/identity/protocols/oauth2).

**Reconnect when tool calls return 401.** A 401 usually means the access token is no longer valid. The user may have revoked access, changed password or two-factor settings, been affected by an administrator policy, or exceeded Google's refresh-token limit. Re-authenticate the connected account and retry.
