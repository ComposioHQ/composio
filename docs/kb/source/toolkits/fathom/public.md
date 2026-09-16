---
type: "reference"
title: "Fathom"
description: "Public support knowledge for Fathom."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "fathom"
---
# Fathom


## Fathom and granola_mcp are supported meeting transcription toolkits; request unsupported tools separately

The `fathom` and `granola_mcp` toolkits are supported. If a requested meeting transcriber is not available, such as Otter, direct the customer to submit the request at `https://request.composio.dev/`.

## OAuth authorization URLs are provider-specific

Authorization URLs depend on the provider/toolkit involved in the connection flow. When troubleshooting OAuth redirects, check which provider the auth config and connection flow resolve to before treating a provider-specific authorization domain as inherently incorrect.
