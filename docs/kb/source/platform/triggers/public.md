---
type: "guide"
title: "Triggers"
description: "Public trigger catalog and webhook delivery guidance."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-14T00:00:00Z"
tags:
  - "triggers"
  - "webhooks"
  - "retries"
  - "catalog"
---
# Triggers

## Find every toolkit that currently supports triggers

Do not rely on a dashboard count as the complete trigger catalog because availability changes and list views can be partial.

- Call `GET /api/v3.1/triggers_types` to list trigger types and their parent toolkits. Use `toolkit_slugs` to narrow the result when needed.
- Or call `GET /api/v3.1/toolkits` and select toolkits whose `triggers_count` is greater than zero.
- Follow pagination through every result page before calculating a total or claiming the list is complete.
- Each trigger type declares its required configuration and may be webhook/event-driven or polling-based.

References: [trigger types API](https://docs.composio.dev/reference/api-reference/triggers/getTriggersTypes), [toolkits API](https://docs.composio.dev/reference/api-reference/toolkits/getToolkits), and [creating triggers](https://docs.composio.dev/docs/setting-up-triggers/creating-triggers).

## Trigger webhook delivery is at-least-once

A receiver can occasionally see the same trigger webhook more than once, including the same `log_id` or provider event/message ID, when an outbound delivery attempt is retried. This does not necessarily mean Composio ingested the provider event twice.

Webhook handlers should be idempotent and deduplicate on a stable identifier such as `log_id`, the provider message/event ID, or the webhook event ID. A duplicate that continues beyond normal retry behavior should be escalated with the relevant IDs and receipt timestamps.
