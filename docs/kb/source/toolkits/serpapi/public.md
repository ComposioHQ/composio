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


## Disable SerpAPI by listing premium toolkit slugs in session config

There is no single global toggle for premium tools. To prevent SerpAPI from being available in a session, list `serpapi` in the disabled toolkit slugs for the session config. Other premium slugs commonly disabled together include `composio_search`, `perplexityai`, `exa`, and `codeinterpreter`.

## Use toolkit details to inspect SerpAPI required auth fields

Use `.toolkits.get("serpapi")` to fetch the toolkit details, including required and optional auth fields. For SerpAPI, the connection initiation payload should include a required `generic_api_key` field displayed as `API Key`.

## Search and scraping use cases can use SerpAPI alongside Firecrawl, Exa, Tavily, or Composio Search

For search and scraping use cases, Composio has multiple relevant toolkits: SerpAPI, Firecrawl, Exa, Tavily, and Composio Search. Composio Search provides search providers such as Exa and Tavily without separate auth.
