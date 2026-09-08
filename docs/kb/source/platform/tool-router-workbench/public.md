---
type: "reference"
title: "Tool Router Workbench Retention"
description: "Public support knowledge for Tool Router Workbench Retention."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "tool-router-workbench"
---
# Tool Router Workbench Retention

Use this when customers ask whether Tool Router workbench state persists forever, or whether personal data used in the remote workbench is retained indefinitely.

## A “fresh” client label can still reuse the same sandbox

Workbench and sandbox reuse follows the actual Tool Router session, not an arbitrary client-side session label. Reusing the same `trs_*` session or MCP URL can reuse the same cached workbench and sandbox.

Create a new Tool Router session and use its newly returned MCP URL when a
workflow requires an independent sandbox rather than reused session state.
