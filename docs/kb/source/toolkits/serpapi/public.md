---
type: "reference"
title: "SerpApi"
description: "Public support knowledge for SerpApi."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "serpapi"
---
# SerpApi


## Control SerpAPI availability in a Session

To exclude SerpAPI from a Session, disable `serpapi` in the top-level [toolkit configuration](/docs/configuring-sessions). To control only access through Composio accounts while keeping connected-account routes available, use the [Instant usage controls](/docs/instant-tools#control-instant-usage). Instant eligibility is per tool.

## Use toolkit details to inspect SerpAPI required auth fields

Use `.toolkits.get("serpapi")` to fetch the toolkit details, including required and optional auth fields. For SerpAPI, the connection initiation payload should include a required `generic_api_key` field displayed as `API Key`.

## Search and scraping use cases can use SerpAPI alongside Firecrawl, Exa, Tavily, or Composio Search

For search and scraping use cases, Composio has multiple relevant toolkits: SerpAPI, Firecrawl, Exa, Tavily, and Composio Search. Composio Search provides search providers such as Exa and Tavily without separate auth.
