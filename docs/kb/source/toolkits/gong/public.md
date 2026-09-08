---
type: "reference"
title: "Gong"
description: "Public support knowledge for Gong."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "gong"
---
# Gong


## Gong base URL differs by customer and should be provided at connection time

Gong's base URL can differ per user/customer. Avoid hardcoding a single Gong base URL in a shared auth config for all users; collect and pass the user's `gong_url`/base URL when initiating the connected account.

## Gong connection initiation can use Basic auth fields: access key, access key secret, and Gong URL

For Gong Basic auth, collect the access key as username, access key secret as password, and the customer's Gong URL/base URL. Pass those fields when initiating the connected account; hosted auth can also collect required fields for the customer instead of manually building the frontend form.

## Gong MCP tool scopes can be read from tool annotations in the tools API

For Gong MCP tools, scopes were exposed through the `annotations` field from the `listTools` API per the newer MCP spec. If a customer needs to reason about Gong scopes, inspect tool annotations from the tools API instead of relying only on static docs.
