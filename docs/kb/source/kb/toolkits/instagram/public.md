---
type: reference
title: "Instagram"
description: "Customer-safe support knowledge for Instagram."
category: toolkits/instagram
visibility: public
timestamp: 2026-07-14T00:00:00Z
tags:
  - instagram
---
# Instagram


## Instagram OAuth tokens are bound to the account selected in Facebook Login

Instagram connection goes through Facebook Login, where the user selects which Instagram accounts and Facebook Pages to grant access to. Once Instagram issues the token, it is bound to the specific account selected in that OAuth flow. Composio cannot repoint that token server-side to another Instagram account. To switch accounts, reconnect and select the intended Instagram account/page in the Facebook picker.

## Instagram uses Business Login and only supported/verified scopes should be configured

The Instagram toolkit uses Instagram API with Business Login for Instagram. OAuth errors commonly happen when unsupported or unverified scopes are configured. Prefer the default scopes where possible, because they are intended to cover the toolkit's supported actions. If configuring custom scopes, use only Meta-supported Instagram Business Login permissions and remove unsupported scopes such as `user_profile`.

## Instagram toolkit requires a Business/Creator account for supported business features

Instagram toolkit support is for Instagram Business/Creator account flows. If a customer is using a personal Instagram account, convert or connect a Business/Creator account linked through Meta/Facebook as required by Instagram's API.

## Use `INSTAGRAM_LIST_ALL_MESSAGES` to fetch Instagram messages

Use `INSTAGRAM_LIST_ALL_MESSAGES` to list Instagram messages. In playground, select the correct auth config/connected account; if the desired connected account does not appear, initiate a new connection for the test account and use that auth config.

## Instagram DM send failures with code 10/subcode 2534022 are Meta's 24-hour messaging window

That error is enforced by Instagram/Meta, not Composio. Instagram's messaging API only allows replies inside the 24-hour messaging window. Meta opens that window for specific interactions such as a direct DM from the user, story reply, story mention, or icebreaker/quick-reply button tap. Likes, comments, and follows do not open the window. If the qualifying interaction is older than 24 hours or never happened, the send will fail.

If the customer can show a fresh qualifying inbound DM, accepted message request, correct Business/Creator account, and successful `INSTAGRAM_LIST_ALL_MESSAGES`, do not stop at the generic 24-hour-window answer.

- `INSTAGRAM_SEND_TEXT_MESSAGE` should send `messaging_type: "RESPONSE"` for a normal in-window reply, along with `recipient` and `message`.

- If logs show only `recipient` and `message`, treat it as a likely Composio action payload issue and route to the Instagram toolkit owner.

- `INSTAGRAM_MARK_SEEN` can also return the same Meta subcode. Because sender actions are more provider-limited, collect the exact request/log ID and do not promise it is supported for every Instagram account until the action is retested.

Customer-safe wording:

```text
Meta is returning its allowed-window error, but your evidence suggests this may not be a stale conversation. We found the current Composio send request may be missing Meta's `messaging_type: RESPONSE` field for normal replies, so we are routing this as an Instagram toolkit payload issue instead of asking you to reconnect or wait for another inbound message.
```

## Use your own Meta OAuth app for high-volume Instagram production usage

For high-volume Instagram production usage, use your own Meta OAuth app. The Composio-managed Meta app is shared across users, so customers can run into Meta-side throttling at scale. BYOC/custom OAuth gives the customer a dedicated rate-limit bucket and more control over app review, scopes, and production readiness.

## For custom Instagram/Meta OAuth, configure the redirect URI in the Meta app

For custom Meta/Instagram OAuth apps, make sure the redirect URI is added in the correct Meta app configuration field and matches the Composio auth config redirect URI. Customers using their own auth app credentials can configure their own redirect URI.

## For Instagram DMs via n8n/Claude, Connect MCP can simplify setup

For Instagram DM workflows in clients like n8n or Claude, use Composio For You's Connect MCP endpoint `https://connect.composio.dev/mcp`. Add it as a custom connector with no auth headers; the OAuth flow starts automatically, then the customer can authorize Instagram from the client flow.

## Instagram reply-to-comment may require a scope not available in the managed OAuth app

If Instagram Reply to Comment fails because the required scope is unavailable on Composio's managed OAuth app, use the customer's own Meta OAuth app where that permission is configured and approved.

## `INSTAGRAM_POST_IG_MEDIA_COMMENTS` failures can be caused by an incorrect `ig_media_id`

If `INSTAGRAM_POST_IG_MEDIA_COMMENTS` fails, verify the `ig_media_id` being passed. An incorrect media ID can cause the action to fail even when the action itself is available.

## Instagram is available as a toolkit and can be connected via a new authConfig

Instagram is available in the Composio marketplace. Create a new Instagram authConfig, complete the OAuth connection for the Instagram account, and then use the Instagram toolkit tools. The authConfig ID / integration ID can be found from the dashboard.

## Publish local media with `image_file` or `video_file`

For a locally generated JPEG, PNG, or video, use `INSTAGRAM_POST_IG_USER_MEDIA` and pass the staged file through `image_file` or `video_file`. Upload or stage the file first; a raw local path, workspace/session path, or stale storage key can fail before Meta receives the request. Follow with `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` when the create step succeeds.

Alternatively, use `image_url` or `video_url` only when it is a direct HTTP(S) media URL that Meta can fetch without authentication. The older `INSTAGRAM_CREATE_MEDIA_CONTAINER` path is URL-only and does not accept local files directly.

If the error says `Failed to download file with s3key ... storage returned HTTP 404`, re-stage the file and retry with the fresh `FileUploadable` object. Treat this as a Composio file-reference failure before provider execution, not an Instagram OAuth failure.
