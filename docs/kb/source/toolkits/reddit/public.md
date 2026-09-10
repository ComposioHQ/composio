---
type: "reference"
title: "Reddit"
description: "Public support knowledge for Reddit."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "reddit"
---
# Reddit


## Use Connect MCP for Reddit OAuth callback failures in Claude Code

For Claude Code Reddit MCP OAuth callback failures on the legacy MCP path, switch the MCP server URL to `https://connect.composio.dev/mcp`. Remove the old `x-api-key` header and configure the current `x-consumer-api-key` header from the AI Clients setup. Connect MCP can then start the Reddit authorization flow from the client.

## Reddit supports managed and customer-owned OAuth 2.0

Use Composio-managed OAuth for the standard connection flow. Create a custom
auth config with the customer's Reddit client ID and client secret when they
need control over provider app settings and credentials. Make sure Reddit has
approved a custom app for its intended access before using it in production.

## Reddit toolkit behavior can change when Reddit changes its API or enforcement policies

The Reddit toolkit depends on Reddit's underlying APIs and policy enforcement. Changes or restrictions from Reddit can affect toolkit behavior, and Reddit does not guarantee stable API behavior for all use cases. For production usage, use your own Reddit credentials to maximize control, and account for Reddit's spam and responsible builder policies when designing automations.

## Older Reddit Create Post tool versions may require `flair_id`

If Reddit Create Post fails on version `00000000_00`, check whether the request is missing `flair_id`; that old version requires it. Prefer pinning a specific current toolkit/tool version to avoid breaking changes. In recent Reddit tool versions, `flair_id` is no longer required for the Create Post call.
