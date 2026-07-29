## Why does TikTok authorization fail with `unauthorized_client` or a `client_key` error before login?

Composio does not currently provide managed OAuth credentials for TikTok, so you must create a [custom auth config](/docs/auth-configuration/custom-auth-configs) using your own TikTok developer app.

This error comes from TikTok before it redirects back to Composio. First verify that the value in Composio's **Client ID** field is the **Client key** from the same TikTok app and environment as the Client secret. If the credentials are correct, check the app's Production status in TikTok. A Production app in **Draft** or **In review** is not available to public users; its version must be approved and **Live**. Also confirm that Login Kit and every scope requested by the Composio auth config are enabled and approved for that version. If TikTok approved only a subset, request only those scopes.

For pre-approval testing, use credentials from a [TikTok Sandbox](https://developers.tiktok.com/doc/add-a-sandbox) and add each account under **Sandbox settings → Target users** before connecting it. TikTok allows up to 10 target users and notes that changes can take up to one hour to appear. Sandbox is restricted and does not support the Content Posting API for public videos or the Data Portability API. See TikTok's [app registration and review statuses](https://developers.tiktok.com/doc/getting-started-create-an-app) for production requirements.

## Why does TikTok fail after consent with `Invalid OAuth2 token exchange response` and `access_token Required`?

This means TikTok returned an authorization code, but its token-exchange response did not contain an `access_token`. The displayed Composio message is a validation error, not the underlying TikTok error. We reproduced this exact message with an incorrect TikTok Client secret, although other token-exchange errors can produce the same message.

Check the following, then start a new connection:

1. In TikTok, select the intended **Production** or **Sandbox** environment and copy its Client key and Client secret.
2. In the Composio auth config, update both values together. Enter the TikTok Client key in **Client ID**, click **Change secret**, paste the Client secret again, and save. A masked secret only confirms that a value is stored; it does not confirm that the value matches TikTok.
3. Verify that the redirect URI registered in that TikTok environment exactly matches the redirect URI shown in the Composio auth config. TikTok requires the token exchange to use the same redirect URI as the authorization request.
4. For Sandbox, confirm that the signing-in TikTok account appears under **Target users** and allow up to one hour for recent changes to propagate.
5. Retry with a fresh connection rather than reusing an earlier callback URL or authorization code.

If it still fails, retain TikTok's `log_id` and the failed Composio connection or link ID when contacting support. TikTok documents the successful and error response formats in [User Access Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management) and explains provider error categories in [OAuth Error Handling](https://developers.tiktok.com/doc/oauth-error-handling).
