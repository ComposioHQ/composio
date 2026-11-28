## Why does TikTok return `unauthorized_client` or a `client_key` error before consent?

TikTok requires your own developer app. Check the app before replacing credentials:

1. Use credentials from the same sandbox or live app you configured. In a [sandbox](https://developers.tiktok.com/docs/en/add-a-sandbox), add the signing-in account as a target user and apply your changes.
2. Enable [Login Kit](https://developers.tiktok.com/docs/en/login-kit-overview). Posting also needs the Content Posting API and its approved scopes. Successful login alone doesn't grant posting access.
3. Copy TikTok's **Client key** into Composio's `client_id` field and **Client secret** into `client_secret`. Check for swapped values and whitespace. TikTok's authorization request must use `client_key`, even though Composio's configuration field is named `client_id`.
4. Match the outgoing `redirect_uri`, the auth config's `oauth_redirect_uri`, and the URI registered under Login Kit exactly. The current toolkit default is `https://backend.composio.dev/api/v1/auth-apps/add`. If you override it, update both places. TikTok's [web redirect rules](https://developers.tiktok.com/docs/en/login-kit-web) require a static HTTPS URI without query parameters or fragments. Your application's final return URL is a separate redirect.
5. Set an explicit comma-separated `scopes` value containing only permissions approved for your app. The toolkit defaults include `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`, and `video.publish`. An app approved only for basic login shouldn't request all of them.

Start a fresh connection after correcting the config. If the generated authorization URL sends `client_id` instead of `client_key`, or matching app settings still fail, send the redacted URL and TikTok's error details to [support@composio.dev](mailto:support@composio.dev). Don't rewrite the generated OAuth URL or bypass state validation.

## Why is `access_token` missing after TikTok consent succeeds?

Missing `access_token` is a symptom, not a diagnosis. Preserve the HTTP status and provider error body, including `error`, `error_description`, and `log_id` when present. TikTok's [token endpoint](https://developers.tiktok.com/docs/en/oauth-get-a-user-access-token) expects form-encoded `client_key`, `client_secret`, `code`, `grant_type=authorization_code`, and the same `redirect_uri` used for authorization.

After fixing a mismatch, start a fresh authorization flow. If Composio performs the exchange, ask support to inspect its upstream request and response. Include the auth config ID, connected account ID, and UTC timestamp. Redact secrets, tokens, authorization codes, and OAuth `state` values. A completed consent screen doesn't prove that the exchange succeeded, and a missing-token error doesn't prove that your credentials are wrong.

## Why can't my TikTok sandbox app publish public videos?

Sandbox mode doesn't support public video posting. Public posting requires TikTok's content posting audit for your own developer app. Check the app's approval status and granted posting scopes before retrying. TikTok's [Direct Post prerequisites](https://developers.tiktok.com/docs/en/content-posting-api-get-started) explain the audit and `video.publish` approval requirements.

## How do I connect TikTok through MCP?

For an existing MCP client, use [Composio Connect](/docs/composio-connect) at `https://connect.composio.dev/mcp`. Don't construct a TikTok-specific MCP URL from an old example. If you're building an application, create a [session MCP endpoint](/docs/sessions-via-mcp) and use its returned URL and headers.

Connecting the MCP client and authorizing TikTok are separate steps. If the client connects but TikTok consent fails, check your TikTok app, credentials, scopes, and redirect URI using the questions above. For transport or MCP authentication failures, use [connection troubleshooting](/docs/oauth-mcp-troubleshooting).
