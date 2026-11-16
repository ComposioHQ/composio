## What does the Composio + Slack integration do?

Composio turns Slack's API into ready-to-use tools that AI agents and automations can call. With the integration you can send and read messages, manage channels, upload files, react to events, search conversations, and more — all through a unified platform. Composio supports two toolkits: **Slack** (authenticate as a user for workspace-level actions) and **Slackbot** (authenticate as a bot for in-channel messaging, app mentions, and slash commands). Developers connect their Slack workspace once and then orchestrate any combination of these actions from their agents or workflows.

## How does Composio handle my Slack data?

Composio executes API calls on behalf of your connected account. All data is encrypted and subject to a 30-day retention policy. Authentication tokens are encrypted at rest and scoped to the permissions you grant during the OAuth flow. For full details on data handling, retention, and third-party data practices, see our [Privacy Policy](https://composio.dev/privacy).

## How do I set up custom OAuth credentials for Slack?

For a step-by-step guide on creating and configuring your own Slack OAuth credentials with Composio, see [How to create OAuth credentials for Slack](https://composio.dev/auth/slack).

## When do users see "This app isn't listed in the Slack Marketplace…"?

When a member of a Slack workspace tries to install a non-Marketplace app. With Composio managed auth, that means the Legacy managed app. The Standard managed app is approved by Slack. See [Slack managed apps](/toolkits/managed-auth#slack-managed-apps).

**How to resolve:** Switch to the Standard managed app if you don't need message triggers. Otherwise, disable **Require apps from Slack Marketplace** in the workspace's app management settings:

`Settings → Apps & Workflows → App Management Settings`

## Why am I being asked to submit a request during auth?

Because **Require approved apps** is enabled in the workspace's **App Management Settings**. Slack is asking for admin/owner approval before completing the install.

## How can a workspace member complete the connection without asking for permissions or approvals?

Two ways:

- Disable both **Require apps from Slack Marketplace** and **Require approved apps** in the workspace's app management settings.
- Use the workspace's own OAuth app, which is recommended and safest. See [How to create OAuth credentials for Slack](https://composio.dev/auth/slack).

## What is the difference between Slack and Slackbot toolkits?

Slack is for workspace-level API access (channels, files, users) while Slackbot is bot-centric (messaging, interactivity). Slack triggers cover workspace events; Slackbot covers bot entry points like app mentions, DMs, and slash commands. Slack can post as the app; Slackbot posts as the bot user.

## Where can I find Slack's available scopes?

See the [Slack scopes reference](https://docs.slack.dev/reference/scopes/).

## Why am I getting a redirect URI mismatch error?

Update the redirect URL in your Slack App under OAuth & Permissions → Redirect URLs.

## How do I set up Slack event webhooks?

With Composio-managed Slack credentials, the webhook endpoint is already provisioned, so just create the trigger. The Standard managed app does not receive the four message triggers. Use the Legacy managed app or your own Slack app for those. See [Slack managed apps](/toolkits/managed-auth#slack-managed-apps). If you bring your own Slack OAuth app, see [Custom OAuth webhooks](https://docs.composio.dev/docs/setting-up-triggers/custom-oauth-webhooks).

## Why am I getting scope errors on Slack?

Either you're missing a bot scope (add one under OAuth & Permissions) or you have "Insufficient scopes" (ensure all scopes from your auth config are configured in the Slack app).

## What does the `as_user` parameter do in Slack tools?

For the Slack toolkit, set `as_user=True` to post as the authenticated user. For Slackbot, leave it blank (defaults to false). A `missing_charset` error usually means invalid `as_user`, wrong channel ID, or missing required fields.

## Why aren't my Slack triggers working?

If you use Composio managed auth, check which managed app the connection uses. The Standard app does not receive `SLACK_CHANNEL_MESSAGE_RECEIVED`, `SLACK_DIRECT_MESSAGE_RECEIVED`, `SLACK_RECEIVE_BOT_MESSAGE`, or `SLACK_RECEIVE_MESSAGE`. Use the Legacy managed app or your own Slack app for those triggers. See [Slack managed apps](/toolkits/managed-auth#slack-managed-apps).

For everything else, see [Triggers](/docs/triggers).

## Which Composio managed Slack app should I use?

Slack has two managed apps. Standard is the default. Slack has approved it and gives it higher rate limits, but it does not receive the four message triggers. Legacy is not approved by Slack and gets lower rate limits, but it receives every Slack trigger. Keep Standard unless you need message triggers. See [Slack managed apps](/toolkits/managed-auth#slack-managed-apps).

## Slack Marketplace warnings during OAuth

Slack may show a Marketplace warning when the OAuth app is not listed or approved in Slack Marketplace. The OAuth flow can still work if the workspace allows non-Marketplace apps, but workspaces with stricter app policies may require admin approval before the connection can complete.

Slack has approved the Standard managed app. The Legacy managed app is not approved, so Slack shows this warning for it. If the warning blocks users, switch to Standard, use the workspace's own Slack OAuth app, or ask a workspace admin to approve the app. See [Slack managed apps](/toolkits/managed-auth#slack-managed-apps).

![Slack OAuth consent warning stating that the app is not approved by Slack.](/images/kb/toolkits/slack/slack-marketplace-warning.png)

## Do I have to be a Workspace Owner to install the app?

In some cases — yes. For example, when installing non-Marketplace apps, you'll need to be an owner to install directly and complete the connection. As a member, you'd need to either request approval, or ask the owner to disable **Require approved apps**.
