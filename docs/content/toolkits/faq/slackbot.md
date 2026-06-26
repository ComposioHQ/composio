## When should I use Slack for user actions and Slackbot for bot-token/bot-scope actions?

Slack and Slackbot serve different token models. The Slack toolkit performs actions on behalf of an actual Slack user. The Slackbot toolkit performs actions as a bot and should be used for bot scopes such as `channels:join` or bot-token workflows. For mixed use cases, create separate Slack and Slackbot auth configs rather than combining user and bot scopes in one connection.

## How should I handle slackbot triggers require a verification token or subscription ID in custom auth?

For Slackbot triggers with custom auth, configure the Slack app verification token in the auth config, then create a fresh connection after updating the auth config. For newer Slack event flows, try the Slack subscription ID from the app credentials instead of the older verification ID when events do not match.

## How should I handle private Slack channels and DMs require extra history scopes?

Slack private-channel and DM access requires additional scopes. Use `groups:history` for private channels, `im:history` for direct messages, and `mpim:history` for multi-person DMs. These scopes are not always included by default and may be limited by Slack plan/provider constraints, so the user may need a custom Slack app with the relevant scopes.

## How should I handle slack file downloads use `SLACK_DOWNLOAD_SLACK_FILE` with a Slack file ID?

Slack file content can be downloaded with `SLACK_DOWNLOAD_SLACK_FILE`. The tool needs the Slack file ID, usually starting with `F`. If the user does not have the file ID yet, use `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` first and pass the returned file ID to the download tool.

## How should I handle revoked Slack tokens may stay `ACTIVE` for two refresh cycles before expiring?

Slack connected accounts may remain `ACTIVE` briefly after revocation because Composio uses retry cycles before marking an account `EXPIRED`. This grace period avoids false expirations from transient provider 401/400 responses and can take roughly two refresh attempts. If Slack returns `account_inactive`, also verify whether the Slack account itself is inactive rather than only token-revoked.

## How should I handle with Slack token rotation enabled, fetch connected account data frequently enough to get fresh tokens?

If Slack token rotation is enabled, a token may only be valid for a short period, described  as about two refreshes or under 30 minutes. If the user directly uses tokens from connected account data, their backend should fetch the connected account frequently enough to pick up fresh tokens instead of reusing stale ones.

## What should I know about Slack short auth links?

The short `/api/v3/s/...` auth link is only a shortened connection initiation URL that redirects the browser to Slack. It is not the `redirect_uri` sent to Slack. Configure the static redirect/callback URI shown in the Composio auth config in the Slack OAuth app; either supported v1 or v3 callback URI can be used depending on the auth config.

## What does `SLACKBOT_SEND_MESSAGE` mean?

`SLACKBOT_SEND_MESSAGE` is not the Slackbot send-message tool slug. Use the actual Slackbot send-message slug exposed by the toolkit, such as `SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`, or fetch tool slugs dynamically before execution.

## How should I handle slackbot trigger payloads include `connection_id` and `trigger_id`?

Slackbot trigger payloads include identifiers such as `connection_id` and `trigger_id` inside the payload data. Use `connection_id` to map the event back to the connected account involved in the trigger.
