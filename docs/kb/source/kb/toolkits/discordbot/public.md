---
type: reference
title: "Discord Bot"
description: "Customer-safe support knowledge for Discord Bot."
category: toolkits/discordbot
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - discordbot
---
# Discord Bot


## Discord and DiscordBot use different token types

Discord has two different authorization models: a user token represents an individual Discord user, while a bot token represents a bot account inside Discord. Composio separates these into different toolkits because the credentials and API behavior are different. Use the Discord toolkit for user-authorized actions and DiscordBot when the workflow needs to act as a Discord bot.

## Managed DiscordBot OAuth 401s can be worked around with custom credentials

When DiscordBot tool calls return 401 on an active connection, first identify whether the auth config uses Composio-managed OAuth or custom credentials. Several reports were tied to Composio-managed DiscordBot OAuth app configuration issues. The practical workaround is to create a DiscordBot auth config with the customer's own custom Discord credentials and retry the tool call. If custom credentials still fail, ask for a tool-call log ID and auth config ID so the team can debug the specific connection.

## Discord message triggers need bot-token auth, which is not available through Discord OAuth user auth

Discord's REST endpoint for channel messages requires a bot token in the Authorization header. OAuth user tokens, even with message-related scopes, do not satisfy that REST API requirement. At the time of these tickets, the Discord toolkit exposed the new-message trigger but only accepted OAuth user auth, while DiscordBot accepted bot-token auth but did not expose that trigger. Treat this as an architectural limitation/bug: the customer cannot solve it by adding more OAuth user scopes alone, and the trigger needs a bot-token-capable path.

## Verify Discord auth config scopes when bot actions do not respond

For DiscordBot behavior that does not respond as expected, verify that the Discord auth config includes the necessary scopes and permissions for the action being tested. Discord's OAuth2 documentation should be used as the source for the required scopes. If scopes look correct and the issue persists, collect the connected account ID or log ID for debugging.

## Multiple connected accounts for the same app are not supported

Composio does not currently support connecting multiple accounts for the same app in the same way a customer might expect from separate app instances. If a workflow needs separate identities, use the supported Composio/MCP authentication model and plan around one active connected account per app context until multi-account support is available.
