---
type: guide
title: Triggers
description: Customer-safe trigger catalog and webhook delivery guidance.
category: platform/triggers
visibility: public
timestamp: 2026-07-14T00:00:00Z
tags:
  - triggers
  - webhooks
  - retries
  - catalog
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

Composio can retry an outbound trigger webhook delivery, so your endpoint may receive the same event more than once. Duplicate deliveries can include the same `log_id`, provider event or message ID, or webhook event ID. This does not necessarily mean Composio ingested the provider event twice.

Make your webhook handler idempotent and deduplicate each event on a stable identifier. Good choices include `log_id`, the provider event or message ID, or the webhook event ID. If duplicates continue beyond normal retry behavior, contact Composio support with the relevant IDs and receipt timestamps.
