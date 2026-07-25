A TikTok `client_key` error is returned by TikTok during its authorize step, not by Composio. TikTok names the field `client_key` where most providers use `client_id`.

## Check the credentials first

1. Re-copy the Client Key and Client Secret from your TikTok developer app, watching for swapped values and trailing spaces.
2. Confirm the registered redirect URI matches exactly what TikTok expects — static and parameter-free.
3. If an older flow is involved, unshorten the redirect URL and check which parameter shape is actually being sent.

## Check who is allowed to authorize

App status decides who can complete OAuth at all. If your TikTok app is in sandbox mode or under review, only authorized testers can finish the flow — a correctly configured app still fails for everyone else. Confirm the app type and status, sandbox versus production mode, the enabled APIs and scopes, and the registered redirect URI before treating this as a credential problem.
