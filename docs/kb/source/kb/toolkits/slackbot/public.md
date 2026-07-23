---
type: reference
title: "Slackbot"
description: "Customer-safe support knowledge for Slackbot."
category: toolkits/slackbot
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - slackbot
---
# Slackbot


## Use Slack for user actions and Slackbot for bot-token/bot-scope actions

Slack and Slackbot serve different token models. The Slack toolkit performs actions on behalf of an actual Slack user. The Slackbot toolkit performs actions as a bot and should be used for bot scopes such as `channels:join` or bot-token workflows. For mixed use cases, create separate Slack and Slackbot auth configs rather than combining user and bot scopes in one connection.

## Slackbot triggers require a verification token or subscription ID in custom auth

For Slackbot triggers with custom auth, configure the Slack app verification token in the auth config, then create a fresh connection after updating the auth config. For newer Slack event flows, support also recommended trying the Slack subscription ID from the app credentials instead of the older verification ID when events do not match.

## Private Slack channels and DMs require extra history scopes

Slack private-channel and DM access requires additional scopes. Use `groups:history` for private channels, `im:history` for direct messages, and `mpim:history` for multi-person DMs. These scopes are not always included by default and may be limited by Slack plan/provider constraints, so the customer may need a custom Slack app with the relevant scopes.

## Slack file downloads use `SLACK_DOWNLOAD_SLACK_FILE` with a Slack file ID

Slack file content can be downloaded with `SLACK_DOWNLOAD_SLACK_FILE`. The tool needs the Slack file ID, usually starting with `F`. If the customer does not have the file ID yet, use `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` first and pass the returned file ID to the download tool.

## Revoked Slack tokens may stay `ACTIVE` for two refresh cycles before expiring

The connection-refresh flow uses roughly two attempts over about 30 minutes to avoid false expirations from transient provider 401/400 responses.

If Slack returns `account_inactive`, also verify whether the Slack account itself is inactive rather than only token-revoked.

## With Slack token rotation enabled, fetch connected account data frequently enough to get fresh tokens

If Slack token rotation is enabled, a token may only be valid for about two refreshes or under 30 minutes. If the customer directly uses tokens from connected account data, their backend should fetch the connected account frequently enough to pick up fresh tokens instead of reusing stale ones.

## Slack short auth links are not the OAuth redirect URI

The short `/api/v3/s/...` auth link is only a shortened connection initiation URL that redirects the browser to Slack. It is not the `redirect_uri` sent to Slack. Configure the static redirect/callback URI shown in the Composio auth config in the Slack OAuth app; either supported v1 or v3 callback URI can be used depending on the auth config.

## `SLACKBOT_SEND_MESSAGE` is not a valid Slackbot tool slug

`SLACKBOT_SEND_MESSAGE` is not the Slackbot send-message tool slug. Use the actual Slackbot send-message slug exposed by the toolkit, such as `SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`, or fetch tool slugs dynamically before execution.

## Slackbot trigger payloads include `connection_id` and `trigger_id`

Slackbot trigger payloads include identifiers such as `connection_id` and `trigger_id` inside the payload data. Use `connection_id` to map the event back to the connected account involved in the trigger.

## Slackbot DM triggers use the connected user's identity, not the bot identity

`SLACKBOT_DIRECT_MESSAGE_RECEIVED` is registered under the Slack user who authorized the connected account. For DM events that require event-level authorization, Composio delivers only when Slack's authorized identity matches that connected user.

A DM sent to the bot can be accepted at the webhook ingress but then resolve to the bot's Slack identity and be filtered before trigger delivery. This is not necessarily a missing scope or webhook outage. DMs received by the connected user are the supported path; a Slack user-token DM trigger can be used for that user's DMs, but it does not make bot-directed DMs deliver.

## Slackbot trigger setup needs `team:read` on the user token

Slack apps have separate Bot Token Scopes and User Token Scopes. If Slackbot trigger creation fails with `missing_scope` and `needed: team:read`, add `team:read` under the Slack app's User Token Scopes and to the auth config's user-token scopes, then reconnect before recreating the trigger.

Adding it only as a bot scope does not fix the workspace-information call used during trigger setup. If this happens with Composio-managed Slackbot auth, route it to support as a managed scope gap.
