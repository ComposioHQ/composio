---
type: "troubleshooting"
title: "Odoo"
description: "Public troubleshooting guidance for Odoo tools."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "odoo"
  - "json-rpc"
---
# Odoo

## JSON-RPC access errors can arrive inside HTTP 200 responses

`ODOO_CALL_ODOO_JSONRPC` can receive HTTP 200 while the JSON-RPC body contains an `error` such as `access denied`. HTTP success only confirms transport; inspect the returned JSON-RPC envelope.

Verify the instance URL, database name, API key, and the Odoo user's permission for the requested model and method. Prefer current JSON-2 tools where they cover the use case. If the body still contains an application error, share the Composio log ID and timestamp without sharing the API key.
