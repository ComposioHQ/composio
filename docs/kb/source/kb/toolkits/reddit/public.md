---
type: reference
title: "Reddit"
description: "Customer-safe support knowledge for Reddit."
category: toolkits/reddit
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - reddit
---
# Reddit


## Use Connect MCP for Reddit OAuth callback failures in Claude Code

For Claude Code Reddit MCP OAuth callback failures on the legacy MCP path, switch the MCP server URL to `https://connect.composio.dev/mcp` and remove the `x-api-key` header. Connect MCP starts the OAuth authorization flow itself, so the client does not need to manage the API key in headers.

## Reddit supports OAuth 2.0 custom credentials in auth configs

Reddit uses OAuth 2.0. For more control, create the Reddit auth config with your own Reddit client ID and client secret instead of relying on managed/default credentials. This is the recommended setup for production-style usage because it gives the customer control over their Reddit app and credentials.

## Reddit toolkit behavior can change when Reddit changes its API or enforcement policies

The Reddit toolkit depends on Reddit's underlying APIs and policy enforcement. Changes or restrictions from Reddit can affect toolkit behavior, and Reddit does not guarantee stable API behavior for all use cases. For production usage, use your own Reddit credentials to maximize control, and account for Reddit's spam and responsible builder policies when designing automations.

## Older Reddit Create Post tool versions may require `flair_id`

If Reddit Create Post fails on version `00000000_00`, check whether the request is missing `flair_id`; that old version requires it. Prefer pinning a specific current toolkit/tool version to avoid breaking changes. In recent Reddit tool versions, `flair_id` is no longer required for the Create Post call.
