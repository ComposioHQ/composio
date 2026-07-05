## When should I use Slack for user actions and Slackbot for bot-token/bot-scope actions?

Slack and Slackbot serve different token models. The Slack toolkit performs actions on behalf of an actual Slack user. The Slackbot toolkit performs actions as a bot and should be used for bot scopes such as `channels:join` or bot-token workflows. For mixed use cases, create separate Slack and Slackbot auth configs rather than combining user and bot scopes in one connection.

## Slackbot triggers require a verification token or subscription ID in custom auth

For Slackbot triggers with custom auth, configure the Slack app verification token in the auth config, then create a fresh connection after updating the auth config. For newer Slack event flows, try the Slack subscription ID from the app credentials instead of the older verification ID when events do not match.

## Private Slack channels and DMs require extra history scopes

Slack private-channel and DM access requires additional scopes. Use `groups:history` for private channels, `im:history` for direct messages, and `mpim:history` for multi-person DMs. These scopes are not always included by default and may be limited by Slack plan/provider constraints, so the user may need a custom Slack app with the relevant scopes.

## Revoked Slack tokens may stay `ACTIVE` for two refresh cycles before expiring

Slack connected accounts may remain `ACTIVE` briefly after revocation because Composio uses retry cycles before marking an account `EXPIRED`. This grace period avoids false expirations from transient provider 401/400 responses and can take roughly two refresh attempts. If Slack returns `account_inactive`, also verify whether the Slack account itself is inactive rather than only token-revoked.

## With Slack token rotation enabled, fetch connected account data frequently enough to get fresh tokens

If Slack token rotation is enabled, a token may only stay valid for about two refreshes, often under 30 minutes. If the user directly uses tokens from connected account data, their backend should fetch the connected account frequently enough to pick up fresh tokens instead of reusing stale ones.

## What should I know about Slack short auth links?

The short `/api/v3/s/...` auth link is only a shortened connection initiation URL that redirects the browser to Slack. It is not the `redirect_uri` sent to Slack. Configure the static redirect/callback URI shown in the Composio auth config in the Slack OAuth app; either supported v1 or v3 callback URI can be used depending on the auth config.
