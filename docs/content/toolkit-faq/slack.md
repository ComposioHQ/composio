## How do I set up custom OAuth credentials for Slack?

For a step-by-step guide on creating and configuring your own Slack OAuth credentials with Composio, see [How to create OAuth credentials for Slack](https://composio.dev/auth/slack).

## What is the difference between Slack and Slackbot toolkits?

Slack is for workspace-level API access (channels, files, users) while Slackbot is bot-centric (messaging, interactivity). Slack triggers cover workspace events; Slackbot covers bot entry points like app mentions, DMs, and slash commands. Slack can post as the app; Slackbot posts as the bot user.

## Where can I find Slack's available scopes?

See the [Slack scopes reference](https://docs.slack.dev/reference/scopes/).

## Why am I getting a redirect URI mismatch error?

Update the redirect URL in your Slack App under OAuth & Permissions → Redirect URLs.

## How do I set up Slack event webhooks?

Enable Event Subscriptions in your Slack app. Set the Request URL to `https://backend.composio.dev/api/v3/trigger_instances/slack/default/handle`. Add events (e.g., `reaction_added`) to Subscribe to Bot Events and save. If using the Slackbot integration, add the bot to the channels you want to monitor.

## Why am I getting scope errors on Slack?

Either you're missing a bot scope (add one under OAuth & Permissions) or you have "Insufficient scopes" (ensure all scopes from your auth config are configured in the Slack app).

## What does the `as_user` parameter do in Slack tools?

For the Slack toolkit, set `as_user=True` to post as the authenticated user. For Slackbot, leave it blank (defaults to false). A `missing_charset` error usually means invalid `as_user`, wrong channel ID, or missing required fields.

## Why aren't my Slack triggers working?

Provide the Verification Token or signing secret in the auth config so Composio can validate incoming events.

---
