---
type: "reference"
title: "Intercom"
description: "Public support knowledge for Intercom."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "intercom"
---
# Intercom


## Use External Pages or a custom agent when connecting MCP knowledge to Intercom Fin

Composio does not control how Intercom Fin retrieves knowledge inside Intercom. For this use case, either push MCP-derived content into Fin's Content Library by creating and managing Intercom External Pages, or build a custom AI agent with Composio SDKs that connects to both the MCP server and Intercom for support workflows such as replying to conversations, creating tickets, and managing contacts.

## INTERCOM_LIST_ALL_COMPANIES per_page limit is 60

For Intercom company listing through Composio, keep `per_page` at 60 or lower. The generic Intercom pagination page can be misleading for this endpoint; Composio verified the list companies endpoint limit as 60 and updated the field description accordingly.

## Update Python SDK packages when Intercom tool schemas fail on reserved parameter names

This reserved-keyword schema issue was fixed in the SDK. Ask the user to update both `composio` and `composio-langchain` to the latest available versions; the fix was available by SDK version `0.11.4`.
