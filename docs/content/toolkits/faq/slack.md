## What does the Composio + Slack integration do?

Composio turns Slack's API into ready-to-use tools that AI agents and automations can call. With the integration you can send and read messages, manage channels, upload files, react to events, search conversations, and more — all through a unified platform. Composio supports two toolkits: **Slack** (authenticate as a user for workspace-level actions) and **Slackbot** (authenticate as a bot for in-channel messaging, app mentions, and slash commands). Developers connect their Slack workspace once and then orchestrate any combination of these actions from their agents or workflows.

## How does Composio handle my Slack data?

Composio executes API calls on behalf of your connected account. All data is encrypted and subject to a 30-day retention policy. Authentication tokens are encrypted at rest and scoped to the permissions you grant during the OAuth flow. For full details on data handling, retention, and third-party data practices, see our [Privacy Policy](https://composio.dev/privacy).

## How do I set up custom OAuth credentials for Slack?

Composio-managed auth works without any setup: create a Slack auth config, choose **Composio Managed**, and connect. Use your own Slack app when you want your own branding, specific scopes, or full control over the app, or when a workspace blocks apps that aren't in the Slack Marketplace.

### Create the Slack app

1. Go to [Slack API: Your Apps](https://api.slack.com/apps) and click **Create New App** → **From scratch**.

   ![Slack API Your Apps page with the Create an App button](/images/toolkits/slack/create-an-app.webp)

   ![Slack Create an app dialog with the From scratch option](/images/toolkits/slack/from-scratch.webp)

2. Enter an **App Name**, select your workspace, and click **Create App**.

   ![Slack Name app and choose workspace dialog with the Create App button](/images/toolkits/slack/name-and-workspace.webp)

3. Open **OAuth & Permissions**. Under **Redirect URLs**, click **Add New Redirect URL**, enter `https://backend.composio.dev/api/v1/auth-apps/add`, click **Add**, then **Save URLs**. It must exactly match the auth config's `oauth_redirect_uri` field.

   ![Slack OAuth & Permissions Redirect URLs with the Composio redirect URL and Save URLs button](/images/toolkits/slack/redirect-urls.webp)

4. On the same page, under **Scopes**, add the scopes your auth config will request. For example, `channels:history` reads channel messages, `chat:write` sends messages, and `users:read` reads user info.

   ![Slack Scopes section listing channels:history, chat:write and users:read](/images/toolkits/slack/oauth-scopes.webp)

5. Open **Basic Information** and scroll to **App Credentials**. Copy the **Client ID**, **Client Secret**, and, if you'll use Slack triggers, the **Verification Token**.

   ![Slack Basic Information App Credentials with Client ID, Client Secret and Signing Secret](/images/toolkits/slack/app-credentials.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create** and select **Slack**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/slack/auth-configs-create.webp)

   ![Composio Create Auth Config dialog with Slack and Slackbot in the search results](/images/toolkits/slack/search-slack.webp)

2. Under **Credentials**, choose **Your Own Credentials** and paste the Client ID and Client Secret. Keep the redirect URI as the value you added in Slack.

   ![Composio Slack auth config with Your Own Credentials selected and Client id and Client secret fields](/images/toolkits/slack/own-credentials.webp)

3. Paste the **Verification Token** if you need Slack triggers, choose the scopes, and click **Create Auth Config**.

   ![Composio Slack auth config Verification Token field and selected scopes](/images/toolkits/slack/verification-token-scopes.webp)

4. Click **Connect Account**, select your workspace on the Slack page, review the permissions, and click **Allow**. Confirm the account shows **Active** on the auth config's **Accounts** tab.

   ![Slack authorization page with workspace picker, requested permissions and the Allow button](/images/toolkits/slack/consent-screen.webp)

   ![Composio Slack auth config Accounts tab with a connected account showing Active](/images/toolkits/slack/active-account.webp)

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow, and [custom OAuth webhooks](/docs/setting-up-triggers/custom-oauth-webhooks) for trigger setup with your own app.

### Scopes

The default auth config requests a broad set covering channels, groups, DMs, chat, files, reactions, pins, reminders, search, usergroups, and users. Request only what your workflow needs; an agent that only sends messages may need just `chat:write`. Every scope the auth config requests must also be added to the Slack app, or users see scope errors. See Slack's [scopes reference](https://docs.slack.dev/reference/scopes/).

### Revoke access

- In Composio, delete the connected account from the auth config, or disable the auth config.
- In Slack, a workspace admin can remove the app under **Settings & administration** → **Manage apps**, which revokes its tokens right away.

## When do users see "This app isn't listed in the Slack Marketplace…"?

When a member of a Slack workspace tries to install a non-Marketplace app.

**How to resolve:** Disable **Require apps from Slack Marketplace** in the workspace's app management settings:

`Settings → Apps & Workflows → App Management Settings`

## Why am I being asked to submit a request during auth?

Because **Require approved apps** is enabled in the workspace's **App Management Settings**. Slack is asking for admin/owner approval before completing the install.

## How can a workspace member complete the connection without asking for permissions or approvals?

Two ways:

- Disable both **Require apps from Slack Marketplace** and **Require approved apps** in the workspace's app management settings.
- Use the workspace's own OAuth app, which is recommended and safest. See **How do I set up custom OAuth credentials for Slack?** on this page.

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

## Slack Marketplace warnings during OAuth

Slack may show a Marketplace warning when the OAuth app is not listed or approved in Slack Marketplace. The OAuth flow can still work if the workspace allows non-Marketplace apps, but workspaces with stricter app policies may require admin approval before the connection can complete.

Composio is working on Marketplace review for the managed Slack app. Until that review is complete, use the workspace's own Slack OAuth app or ask a workspace admin to approve the app if the warning blocks users.

![Slack OAuth consent warning stating that the app is not approved by Slack.](/images/kb/toolkits/slack/slack-marketplace-warning.png)

## Do I have to be a Workspace Owner to install the app?

In some cases — yes. For example, when installing non-Marketplace apps, you'll need to be an owner to install directly and complete the connection. As a member, you'd need to either request approval, or ask the owner to disable **Require approved apps**.
