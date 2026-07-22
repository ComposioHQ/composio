---
type: reference
title: "Ahrefs"
description: "Customer-safe support knowledge for Ahrefs."
category: toolkits/ahrefs
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - ahrefs
---
# Ahrefs

## Ahrefs actions must call api.ahrefs.com, not ahrefs.com

Ahrefs API v3 calls must use `https://api.ahrefs.com/v3`. If an Ahrefs action or connection check calls `https://ahrefs.com/v3` and returns a 404 HTML page, the connector is using the website host instead of the API host. Changing the API key or action payload will not fix that host mismatch.

Confirm the failing request URL. If it does not use `api.ahrefs.com`, contact Composio support with the log ID so the connector configuration can be reviewed.
