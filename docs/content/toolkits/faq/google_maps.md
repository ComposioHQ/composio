## How do I set up custom Google OAuth credentials for Google Maps?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Maps?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Maps API has not been used in project" error?

When using custom OAuth credentials, the Google Maps API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

---

## What does Maps Embed API require?

`GOOGLE_MAPS_MAPS_EMBED_API` requires API-key authentication. Use an auth config whose auth mode is `api-key`, or pass the `api_key` parameter directly when making the tool call.

## How should I handle google Maps OAuth can be blocked by sensitive cloud-platform scope?

Check whether the OAuth app requests the sensitive `https://www.googleapis.com/auth/cloud-platform` scope. If the Google OAuth app has not been verified, users who are not listed as test users and are outside the registering organization can be blocked by Google. Either complete Google verification or ensure the affected users are allowed test/org users for that OAuth app.

## How should I handle recreate Google Maps auth configs after default OAuth app updates?

If Google Maps authentication fails while using the default Composio OAuth app and the default app has been updated, create a new auth config and reconnect. Existing auth configs may continue using the older app configuration.

## How should I handle validate Places `includedTypes` against Google's supported place types?

For Google Maps Places requests, `includedTypes` must use values supported by Google's Places API. If a request fails with an invalid argument around `includedTypes`, compare the value against Google's supported place type lists and replace unsupported values before retrying.

## What does Deprecated `GEOCODING_API` mean?

`GEOCODING_API` belongs to a different toolkit and has been deprecated. Do not require it as part of normal `google_maps` toolkit usage; use the current Google Maps toolkit tool slugs instead.

## How should I handle google Maps APIs may require billing and quota management in GCP?

Most Google APIs used through Composio are generally free to access, but Google Maps is an exception: Maps APIs can require billing on the Google Cloud project. If usage exceeds limits, users may need to request higher limits in their own Google project.
