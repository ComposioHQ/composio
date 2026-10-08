---
type: "guide"
title: "Perplexity AI authentication"
description: "Current API-key setup for the Perplexity AI toolkit."
category: "authentication"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "perplexityai"
---
# Perplexity AI authentication

## Perplexity AI uses the `generic_api_key` connection field

The current `perplexityai` toolkit uses API-key authentication. Create the key
in Perplexity's console and provide it as `generic_api_key` during connection
initiation. The key is shown once by the provider, so store it in the
customer's secret manager and never send it to support.

If a first-party Perplexity tool succeeds but an equivalent Proxy Execute call
returns 401 with the same connection, collect both Log IDs and the redacted
request path. That comparison distinguishes a proxy auth-injection problem from
an invalid provider key without asking the customer to rotate a working key.
