## What does the Composio + Slack integration do?

Composio turns Slack's API into ready-to-use tools that AI agents and automations can call. With the integration you can send and read messages, manage channels, upload files, react to events, search conversations, and more through a unified platform. Composio supports two toolkits: **Slack** (authenticate as a user for workspace-level actions) and **Slackbot** (authenticate as a bot for in-channel messaging, app mentions, and slash commands). Developers connect their Slack workspace once and then orchestrate any combination of these actions from their agents or workflows.

## How does Composio handle my Slack data?

Composio executes API calls on behalf of your connected account. All data is encrypted and subject to a 30-day retention policy. Authentication tokens are encrypted at rest and scoped to the permissions you grant during the OAuth flow. For full details on data handling, retention, and third-party data practices, see our [Privacy Policy](https://composio.dev/privacy).

## How do I set up custom OAuth credentials for Slack?

For a step-by-step guide on creating and configuring your own Slack OAuth credentials with Composio, see [How to create OAuth credentials for Slack](https://composio.dev/auth/slack).

## When do users see "This app isn't listed in the Slack Marketplace…"?

When a member of a Slack workspace tries to install a non-Marketplace app.

**How to resolve:** Disable **Require apps from Slack Marketplace** in the workspace's app management settings:

`Settings → Apps & Workflows → App Management Settings`

## Do I have to be a Workspace Owner to install the app?

In some cases, yes. For example, when installing non-Marketplace apps, you'll need to be an owner to install directly and complete the connection. As a member, you'd need to either request approval, or ask the owner to disable **Require approved apps**.

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

With Composio-managed Slack credentials, the webhook endpoint is already provisioned, so just create the trigger. If you bring your own Slack OAuth app, see [Custom OAuth webhooks](https://docs.composio.dev/docs/setting-up-triggers/custom-oauth-webhooks).

## Why am I getting scope errors on Slack?

Either you're missing a bot scope (add one under OAuth & Permissions) or you have "Insufficient scopes" (ensure all scopes from your auth config are configured in the Slack app).

## What does the `as_user` parameter do in Slack tools?

For the Slack toolkit, set `as_user=True` to post as the authenticated user. For Slackbot, leave it blank (defaults to false). A `missing_charset` error usually means invalid `as_user`, wrong channel ID, or missing required fields.

## Why aren't my Slack triggers working?

See [Triggers](/docs/triggers).

---

## When should I use `user_scopes` for Slack user-token permissions?

For the Slack toolkit, `scopes` refers to bot-user scopes. If the use case is to operate as the actual Slack user, pass the permissions in `user_scopes` on the auth config credentials. Slack is special because it separates bot scopes from user scopes. For user-token tools, set `credentials.user_scopes`; the bot `scopes` field may not matter if the Slack application has no bot-user tools for that use case.

## Revoked Slack tokens can remain ACTIVE briefly before expiring

A Slack connected account may stay `ACTIVE` for about two refresh cycles after token revocation. This is an intentional retry mechanism to avoid expiring accounts too aggressively because providers can return transient auth errors. Depending on the toolkit, the account should be marked `EXPIRED` after roughly two failed refresh attempts, about 30 minutes. If Slack returns `account_inactive`, that may indicate the connected Slack account itself is inactive rather than only a token-revocation case.

## What is required for Slack `assistant.search.context`?

Slack's `assistant.search.context` requires the Slack OAuth app to have the Agents & AI Apps feature enabled, and the Slack workspace must be on Business+ or higher. Verify workspace support by calling `assistant.search.info`; if `is_ai_search_enabled` is `false`, the workspace plan or feature enablement is the blocker. A user can unblock with their own Slack OAuth app that has Agents & AI Apps enabled, but they still need Business+ on the workspace.

## Slack Marketplace warnings during OAuth

Slack may show warnings for non-Marketplace apps depending on workspace policy. The OAuth flow can still work if the workspace allows the app. If the workspace requires Marketplace-approved apps or admin approval, use the workspace's own Slack OAuth app or ask a workspace admin to approve the app.

![Slack OAuth consent warning stating that the app is not approved by Slack.](/images/kb/toolkits/slack/slack-marketplace-warning.png)

## Slack trigger delivery depends on the Slack app event subscription webhook URL

When Slack trigger events stop unexpectedly, check whether the Slack OAuth app's Event Subscriptions `webhook_url` was changed. If the webhook URL or other Slack app event-subscription settings changed, Slack may stop delivering events to Composio even though the trigger instance was previously working.

## When should I use your own Slack OAuth app for production quota isolation?

Slack rate limits are applied per app, workspace, and method. `conversations.history` and `conversations.replies` are among the stricter methods. For production, use your own Slack OAuth app so your quota is isolated to your app and workspace. Composio's default Slack app is shared, so it is not recommended for production workloads that are sensitive to Slack quota pressure.

## What should I know about Slack short connect links?

The short `/api/v3/s/...` URL is not the `redirect_uri` sent to Slack. It is only a shortened link that redirects the browser to Slack's authorization page. The actual Redirect URI is available in the authConfig and must match what is configured in the Slack OAuth app. The static `callbackUrl` / `redirectUri` must be configured consistently on both Composio and the Slack OAuth app, while `redirectUrl` is the per-connection authentication URL used to send the user through the auth flow.

## What is required for `admin.conversations:write`?

`admin.conversations:write` is an enterprise/admin-level Slack scope. For APIs such as `admin.conversations.delete`, the Slack workspace must be on an Enterprise plan. If a user cannot use channel deletion/admin conversation tools, first confirm the Slack workspace plan and whether the app has the required admin scope.

## Slackbot token rotation can make externally cached tokens expire quickly

Slackbot tokens are usually long-lived, but if Slack token rotation is enabled, a given access token may only remain valid for about two refreshes, often under 30 minutes. Composio auto-refreshes tokens on a fixed cadence, about every 15 minutes, not every time the connected account is fetched. If your backend uses provider tokens directly, fetch the connected account frequently enough to get a fresh token instead of caching a token for long periods. Alternatively, migrate to a Slack app where token rotation is not enabled if that better fits the workflow.
