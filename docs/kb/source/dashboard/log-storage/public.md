---
type: "reference"
title: "Dashboard Log Storage"
description: "Public behavior of the project Log storage setting."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "dashboard"
  - "logs"
  - "data-retention"
---
# Dashboard Log Storage

## “Don't store data” removes new payload content, not the audit row

New tool executions can still appear in Tool Logs with audit metadata such as tool, status, timestamp, duration, and related identifiers. With **Don't store data** enabled, their request arguments and response payload content are not stored in those rows.

Changing the setting does not retroactively erase older payloads. Run a new test after changing it and inspect that new row. If new request or response content remains visible, contact support with the timestamp and log reference.

This setting does not define every contractual retention or deletion window. Use Composio's approved security and privacy documentation for those questions.
