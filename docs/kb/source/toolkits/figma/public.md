---
type: "reference"
title: "Figma"
description: "Public support knowledge for Figma."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "figma"
---
# Figma


## Figma token auth is handled by Composio; customers do not need a separate Bearer-token auth scheme

For Figma, customers can provide the supported credentials/token through the toolkit's auth mode, and Composio handles the Bearer authorization header internally. They should not need to manually create a separate Bearer-token auth scheme for normal Figma tool use.

## `FIGMA_EXTRACT_DESIGN_TOKENS` variables may be limited by the customer's Figma plan

Some Figma API features are plan-limited. If `FIGMA_EXTRACT_DESIGN_TOKENS` fails when `include_variables` is enabled, ask the customer to verify their Figma plan/API access. As a workaround, set `include_variables` to false.

## Figma 429s can come from Figma/provider limits; use custom credentials for production

If Figma returns 429, verify the response is coming from Figma and review Figma's rate-limit docs. Composio's default Figma app is fine for testing, but production use should use the customer's own Figma credentials to avoid shared-app pressure and to control scopes/rate limits.

## Remove deprecated `file_read` from Figma auth configs and reconnect

If a Figma auth config contains the deprecated `file_read` scope, remove it and initiate a new connection.

## Figma tools are available across auth modes; fetch available tools dynamically

Figma tools should be usable regardless of whether the connection uses Composio-managed OAuth, a custom OAuth app, or token/API-key auth. If a customer cannot find a tool, fetch available tools dynamically and check the auth scopes required by that tool.

## Common Figma design-token tools include extract, Tailwind conversion, and node fetch

For Figma design-token and component workflows, use `FIGMA_EXTRACT_DESIGN_TOKENS`, `FIGMA_DESIGN_TOKENS_TO_TAILWIND`, and `FIGMA_GET_FILE_NODES`. The older `FIGMA_GET_COMPONENT` action is deprecated. If a needed Figma tool is missing, ask the customer to file a tool request.
