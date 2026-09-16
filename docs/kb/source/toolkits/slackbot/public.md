---
type: "reference"
title: "Slackbot"
description: "Public support knowledge for Slackbot."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "slackbot"
---
# Slackbot


## Use Slack for user actions and Slackbot for bot-token/bot-scope actions

Slack and Slackbot serve different token models. The Slack toolkit performs actions on behalf of an actual Slack user. The Slackbot toolkit performs actions as a bot and should be used for bot scopes such as `channels:join` or bot-token workflows. For mixed use cases, create separate Slack and Slackbot auth configs rather than combining user and bot scopes in one connection.

## Slackbot triggers require the verification token in custom auth

For Slackbot triggers with custom auth, configure the Slack app verification
token in the auth config, then create a fresh connection after updating the auth
config. The current auth schema does not expose a separate subscription-ID
field, so do not substitute one for the verification token.

## Private Slack channels and DMs require extra history scopes

Slack private-channel and DM access requires additional scopes. Use `groups:history` for private channels, `im:history` for direct messages, and `mpim:history` for multi-person DMs. These scopes are not always included by default and may be limited by Slack plan/provider constraints, so the customer may need a custom Slack app with the relevant scopes.

## Slack file downloads use `SLACK_DOWNLOAD_SLACK_FILE` with a Slack file ID

Slack file content can be downloaded with `SLACK_DOWNLOAD_SLACK_FILE`. The tool needs the Slack file ID, usually starting with `F`. If the customer does not have the file ID yet, use `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` first and pass the returned file ID to the download tool.

## Slack short auth links are not the OAuth redirect URI

The short `/api/v3/s/...` auth link is only a shortened connection initiation URL that redirects the browser to Slack. It is not the `redirect_uri` sent to Slack. Configure the static redirect/callback URI shown in the Composio auth config in the Slack OAuth app; either supported v1 or v3 callback URI can be used depending on the auth config.

## Use `SLACKBOT_SEND_MESSAGE` to post a bot message

Use `SLACKBOT_SEND_MESSAGE` to post to a channel, direct message, or private group. Provide exactly one visible content mode: `markdown_text` for normal Markdown content, or `blocks` for a raw Block Kit layout. Use `fallback_text` only with `blocks`.

## Slackbot trigger payloads include `connection_id` and `trigger_id`

Slackbot trigger payloads include identifiers such as `connection_id` and `trigger_id` inside the payload data. Use `connection_id` to map the event back to the connected account involved in the trigger.
