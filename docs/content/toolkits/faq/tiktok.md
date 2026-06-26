## What does TikTok is supported, but users generally need?

TikTok is available as a toolkit, but users should expect to bring their own TikTok developer app credentials. Support repeatedly noted there is no generally available managed/default TikTok OAuth app for normal production use.

## How should I handle tikTok OAuth uses `client_key`; credential mismatch or old `client_id` handling causes `client_key` errors?

A TikTok `client_key` error is returned by TikTok, not Composio. First re-copy the Client Key and Client Secret from the TikTok developer app, checking for swapped values or trailing spaces. Also confirm the registered redirect URI exactly matches TikTok requirements. Historically, TikTok required `client_key` in the authorize URL while older Composio handling used `client_id`; if an older flow is involved, unshorten the redirect URL and verify the parameter shape.

## How should I handle tikTok app status, scopes, and sandbox/production mode determine who can complete OAuth?

For TikTok OAuth failures, ask for the app type/status, sandbox vs production mode, enabled APIs/scopes, redirect URI, and screenshots of the OAuth screen. If the TikTok app is sandbox or under review, only authorized testers/users may be able to complete OAuth.

## What does Public TikTok posting require?

For TikTok public content posting, the user must go through TikTok's content posting audit with their own OAuth app. Without an audited/approved app, posting may be restricted, for example to private-only visibility or limited testing behavior.

## How should I handle tikTok Ads/Marketing may require a separate approved app and test credentials?

TikTok Ads/Marketing support may require a separate approved TikTok app and active account credentials. TikTok app approval can take weeks and may block toolkit setup or testing unless the user can provide valid client credentials.
