---
type: reference
title: "Discord"
description: "Customer-safe support knowledge for Discord."
category: toolkits/discord
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - discord
---
# Discord


## Discord message triggers require bot-token auth, but Discord OAuth trigger support has been limited

Discord's REST endpoint for reading channel messages requires bot-token authentication, not a normal OAuth2 bearer token. The `discord` toolkit supports OAuth user tokens, while `discordbot` supports bot-token auth. Historically, this created a gap where the Discord toolkit had triggers but not bot-token auth, and DiscordBot had bot-token auth but not equivalent triggers. Treat 401s on `DISCORD_NEW_MESSAGE_TRIGGER` as a likely bot-token/auth-mode mismatch and route it as a toolkit-trigger/auth issue.

## DiscordBot 401s on managed OAuth were a known managed-app configuration issue

DiscordBot 401s on Composio-managed auth have been a known issue tied to the managed DiscordBot OAuth app/configuration. When customers hit this, first ask whether they are using Composio-managed OAuth or custom credentials. If they are on managed auth, recommend trying their own Discord credentials / custom auth config as a workaround while Composio's managed Discord app verification/configuration is being fixed.

## Discord OAuth credentials do not have a fixed expiration period

Discord OAuth2 credentials do not have a fixed expiration period. If credentials suddenly fail, they may have been manually revoked, reset, or regenerated in Discord. Ask the customer to refresh or create new Discord OAuth credentials and retry. Testing with Composio's default OAuth app can help determine whether the issue is specific to the customer's Discord OAuth app/account or broader provider behavior.

## Multiple accounts for the same Discord app were not supported in that flow

The DiscordBot setup does not support connecting multiple accounts for the same app. For multi-account use cases, use a Composio MCP or authenticated-tool flow that supports explicit user/connection selection, and verify current same-app multi-account support before choosing the setup.
