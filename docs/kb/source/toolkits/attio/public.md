---
type: "reference"
title: "Attio"
description: "Public support knowledge for Attio."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "attio"
---
# Attio


## Use $contains for partial text matching in ATTIO_FIND_RECORD filters

For partial matching on text attributes in ATTIO_FIND_RECORD, structure the filter with the attribute slug mapped to a $contains condition, for example {"name": {"$contains": "John"}}. If exact-match behavior is reported, ask for the specific attribute/filter shape and use the contains-style filter as the first workaround.

## Use custom tools when an Attio API object is not built into Composio yet

If an Attio endpoint is not covered by the built-in toolkit, route the user to create a custom tool and request the missing tool through the Composio request portal. Custom tools can use Composio-managed auth, so the customer does not need to build the entire OAuth/token-storage layer themselves.

## Top-level $ parameter names were fixed for LLM provider compatibility in the latest schema version

For schema failures caused by top-level $-prefixed parameter names, ask the customer to update to the latest tool schema/toolkit version. The root cause was corrected for top-level $ prefixes, and compatibility was verified across OpenAI, Claude, Gemini, and Vercel AI SDK. Nested $ prefixes were accepted by the major providers tested, while broader parameter naming conventions may still need case-specific review.

## Attio toolkit defaults can stay on the base pinned version unless a version is explicitly selected

Do not assume Attio calls use the latest toolkit definition automatically. Composio can default to an older base pinned version because latest versions can change. If a customer needs updated Attio tool descriptions or fixes, have them explicitly set the Attio toolkit version in their SDK or environment and then retest.
