## What should I know about Instagram OAuth tokens?

Instagram connection goes through Facebook Login, where the user selects which Instagram accounts and Facebook Pages to grant access to. Once Instagram issues the token, it is bound to the specific account selected in that OAuth flow. Composio cannot repoint that token server-side to another Instagram account. To switch accounts, reconnect and select the intended Instagram account/page in the Facebook picker.

## How should I handle instagram uses Business Login and only supported/verified scopes should be configured?

The Instagram toolkit uses Instagram API with Business Login for Instagram. OAuth errors commonly happen when unsupported or unverified scopes are configured. Prefer the default scopes where possible, because they are intended to cover the toolkit's supported actions. If configuring custom scopes, use only Meta-supported Instagram Business Login permissions and remove unsupported scopes such as `user_profile`.

## What does Instagram toolkit require?

Instagram toolkit support is for Instagram Business/Creator account flows. If a user is using a personal Instagram account, convert or connect a Business/Creator account linked through Meta/Facebook as required by Instagram's API.

## When should I use `INSTAGRAM_LIST_ALL_MESSAGES` to fetch Instagram messages?

Use `INSTAGRAM_LIST_ALL_MESSAGES` to list Instagram messages. In playground, select the correct auth config/connected account; if the desired connected account does not appear, initiate a new connection for the test account and use that auth config.

## What should I know about Instagram DM send failures with code 10/subcode 2534022?

That error is enforced by Instagram/Meta, not Composio. Instagram's messaging API only allows replies inside the 24-hour messaging window. Meta opens that window for specific interactions such as a direct DM from the user, story reply, story mention, or icebreaker/quick-reply button tap. Likes, comments, and follows do not open the window. If the qualifying interaction is older than 24 hours or never happened, the send will fail.

- `INSTAGRAM_SEND_TEXT_MESSAGE` should send `messaging_type: "RESPONSE"` for a normal in-window reply, along with `recipient` and `message`.
- `INSTAGRAM_MARK_SEEN` can also return the same Meta subcode when Meta does not allow the action for the account or conversation state.

## When should I use your own Meta OAuth app for high-volume Instagram production usage?

For high-volume Instagram production usage, use your own Meta OAuth app. The Composio-managed Meta app is shared across users, so users can run into Meta-side throttling at scale. BYOC/custom OAuth gives the user a dedicated rate-limit bucket and more control over app review, scopes, and production readiness.

## What should I know about custom Instagram/Meta OAuth, configure the redirect URI in the Meta app?

For custom Meta/Instagram OAuth apps, make sure the redirect URI is added in the correct Meta app configuration field and matches the Composio auth config redirect URI. Users using their own auth app credentials can configure their own redirect URI.

## What should I know about Instagram DMs via n8n/Claude, Connect MCP can simplify setup?

For Instagram DM workflows in clients like n8n or Claude, use Composio For You's Connect MCP endpoint `https://connect.composio.dev/mcp`. Add it as a custom connector with no auth headers; the OAuth flow starts automatically, then the user can authorize Instagram from the client flow.

## How should I handle instagram reply-to-comment may require a scope not available in the managed OAuth app?

If Instagram Reply to Comment requires a Meta permission that is not available on the managed OAuth app, use the user's own Meta OAuth app where that permission is configured and approved.

## How should I handle `INSTAGRAM_POST_IG_MEDIA_COMMENTS` failures can be caused by an incorrect `ig_media_id`?

If `INSTAGRAM_POST_IG_MEDIA_COMMENTS` fails while the tool works in a direct test, verify the `ig_media_id` being passed. An incorrect media ID can cause the action to fail even though the tool itself is working.

## What does Instagram mean?

Instagram is available in the Composio marketplace. Create a new Instagram authConfig, complete the OAuth connection for the Instagram account, and then use the Instagram toolkit tools. The authConfig ID / integration ID can be found from the dashboard.
