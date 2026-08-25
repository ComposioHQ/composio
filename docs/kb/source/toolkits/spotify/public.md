---
type: "reference"
title: "Spotify"
description: "Public support knowledge for Spotify."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "spotify"
---
# Spotify

## Spotify supports Composio-managed and customer-owned OAuth

Use the managed OAuth flow for the standard connection. Configure a custom
Spotify OAuth app when the customer needs control over scopes, provider app
settings, or branding.


## Spotify library scopes may need to be added to the auth config and then the user must reconnect

If Spotify tools need library access, ensure scopes such as `user-library-read` and `user-library-modify` are present in the auth config. After scopes are added, the customer should reconnect so the new scopes are granted on the connected account.

## Custom Spotify toolkit names cannot collide with the built-in Spotify toolkit slug/name

If creating a custom Spotify-related toolkit, avoid naming it exactly `Spotify` because a built-in Spotify toolkit already exists. Use a distinct name such as `spotify-custom` to avoid slug/name collision errors.

## Spotify can be added to an MCP server from the MCP configs page

To use Spotify through MCP, create or edit an MCP config from the platform MCP configs page and add Spotify to that server. Then use the generated MCP URL in the MCP client.

## Spotify has trigger support

Spotify was listed among trigger-capable toolkits, with three Spotify triggers. If a needed Spotify trigger is missing, collect the exact event and route it as a trigger request.

## Spotify playlist writes require playlist-modify scopes

If playlist write actions return Spotify `403 Insufficient client scope`, make sure the auth config requests `playlist-modify-public`, `playlist-modify-private`, or both as appropriate. Add the scopes before reconnecting; reconnecting an unchanged auth config preserves the same missing-scope problem.

This is separate from older playlist endpoint issues. A call can reach the current `/items` endpoint and still fail because its token lacks playlist write permission.
