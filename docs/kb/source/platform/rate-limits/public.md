---
type: "reference"
title: "Platform API Rate Limits"
description: "Public guidance for organization-level Composio API limits and 429 handling."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "api"
  - "rate-limits"
  - "billing"
---
# Platform API Rate Limits

## Organization API limits and 429 handling

Composio applies a shared API budget per organization across authenticated endpoints. Current published limits are Starter and Hobby: 2,000 requests per minute; Growth: 10,000 per minute; Enterprise: custom. Check the [current rate-limit documentation](https://docs.composio.dev/reference/v3/rate-limits) before quoting a plan limit, and do not describe Enterprise as unlimited.

Rate-limit responses include remaining/window information, and a 429 includes `Retry-After`. Honor `Retry-After` before retrying. Provider quotas such as Google API limits are separate and can throttle a tool even when the Composio organization has capacity.

If an upgraded organization still sees its old 2,000-per-minute ceiling, share the error time and response rate-limit headers with support.
