---
type: "reference"
title: "Firecrawl"
description: "Public support knowledge for Firecrawl."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "firecrawl"
---
# Firecrawl


## Firecrawl uses API-key auth, not OAuth; provide a Firecrawl API key

Firecrawl does not use a Composio-managed OAuth/test connector flow. It is an API-key toolkit, so the customer needs a Firecrawl API key, and in many cases their own Firecrawl subscription/account. If an MCP client does not prompt for the key, provide it through the connection flow or explicitly tell the agent/client to use the Firecrawl API key for authentication.

## Create a Firecrawl API-key connected account with generic_api_key

For Firecrawl API-key auth, create the connected account with `authScheme: "API_KEY"` and a value object containing `status: "ACTIVE"` and `generic_api_key: "fc-..."`. The exact required key names can be checked from the toolkit metadata/connection initiation fields.

## FIRECRAWL_SEARCH may be hidden by default tool list limits

If `FIRECRAWL_SEARCH` or other Firecrawl tools are missing from a tools list, increase the list limit or paginate. The default list can return only the first 20 tools, so request a higher limit such as `limit=1000` when fetching Firecrawl tools.

## Batch fewer URLs or raise timeout for long Firecrawl scrape jobs

For Firecrawl scrape timeouts, reduce the number of links per request, such as batching 1-2 links at a time for complex pages, or increase the scrape timeout if the tool call supports it. A useful starting value is `timeout: 120000` for roughly a 2-minute timeout.

## Firecrawl API base URL is https://api.firecrawl.dev/v1

The Firecrawl API base URL is `https://api.firecrawl.dev/v1`. If a customer must manually enter a base URL to unblock a connection or custom call, use that value, while treating the need for manual entry as a product/tooling issue if the toolkit should have supplied it automatically.

## Use FIRECRAWL_SCRAPE or FIRECRAWL_EXTRACT for web-content retrieval

For website content retrieval with Firecrawl, use `FIRECRAWL_SCRAPE` to scrape page content or `FIRECRAWL_EXTRACT` for extraction-style workflows. For broader web search, Composio Search may be a better fit depending on the use case.

## Connect MCP sessions are tied to individual consumer accounts, not a shared workspace

For Connect MCP on the For You side, each user's MCP session is tied to their own Composio consumer account, not the shared workspace context. A Firecrawl connection created under one user's account/workspace will not automatically appear for colleagues in Claude. Each colleague should create/connect their own Firecrawl account connection for their individual Connect MCP session.
