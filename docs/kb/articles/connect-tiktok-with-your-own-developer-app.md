The [TikTok toolkit](/toolkits/tiktok) is available, but expect to bring your own TikTok developer app credentials — a managed or default TikTok OAuth app is generally not available.

## Verify a domain you control

TikTok's URL-prefix verification proves ownership of the redirect domain, so it cannot be done on Composio's shared callback domain. Use a redirect URI on a domain you own:

1. Choose a static, parameter-free redirect URI on your own domain.
2. Host TikTok's verification file there.
3. Register that URI in your TikTok app.
4. Forward or proxy the callback through to Composio.

## Public posting needs an audited app

Publishing public content through TikTok requires your own OAuth app to pass TikTok's content posting audit. Without an approved app, posting can be restricted — for example to private-only visibility or limited testing behavior. `TIKTOK_UPLOAD_VIDEO` and `TIKTOK_PUBLISH_VIDEO` are subject to that approval, not to anything configured in Composio.

TikTok Ads and Marketing work may require a separate approved app and active account credentials. TikTok app approval can take time, so plan for it rather than treating it as a connection failure.
