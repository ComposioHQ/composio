---
type: reference
title: "Airtable"
description: "Customer-safe support knowledge for Airtable."
category: toolkits/airtable
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - airtable
---
# Airtable

The sections below provide reusable customer-safe guidance for Airtable.

## Connect Airtable to Claude using MCP

Airtable can be connected to Claude through Composio MCP. Create or use an MCP server with Airtable tools selected, add the MCP server configuration to Claude, and complete the Airtable account connection from the MCP/connect flow.

## Use custom Airtable OAuth credentials for additional scopes

For additional Airtable scopes, use your own Airtable OAuth developer app. Configure the required scopes in Airtable, enable/use custom OAuth credentials in Composio, and create a new integration/auth config with those credentials and scopes. If an existing integration was created before the scope change, create a new one and retry the connection.

## Airtable refresh failures can come from Airtable invalid_grant, invalid_request, temporarily_unavailable, or outage windows

When Airtable connected accounts expire, inspect the refresh error from Airtable. Known cases include 400 invalid_grant and 422 responses with invalid_request or temporarily_unavailable. If failures cluster around the same time, check Airtable's status page because an Airtable-side outage can cause refresh failures. Treat this separately from a Composio-only connection bug and contact Composio support if the failures continue outside the provider outage window.

## Connection initiation timeout after 10 minutes is not Airtable-specific

The expiry reason "Connection initiation did not complete within 10 minutes" means the user opened or initiated the connection but did not finish the authentication flow within ten minutes. It is a generic connected-account timeout across toolkits, not an Airtable-specific error. Start a fresh connection/initiation link and complete the OAuth flow within the allowed window.

## Missing Airtable tools may be caused by default list limits or TS SDK not requesting latest

If Airtable tools appear missing, first increase the tools list limit or paginate because the default response may only return the first page of tools. In Python, listing tools with a higher limit returns the expected tools. In TypeScript, pass `toolkit_versions: "latest"` when listing tools until the SDK handles that automatically. Also note that old names such as `create_multiple_records` and `create_record` were deprecated in favor of current uppercase slugs such as `AIRTABLE_CREATE_RECORDS`.

## AIRTABLE_UPDATE_MULTIPLE_RECORDS updates at most 10 records per call

`AIRTABLE_UPDATE_MULTIPLE_RECORDS` can update a maximum of 10 Airtable records at a time. For larger updates, split the records into batches of 10 and execute multiple calls while respecting Airtable's API rate limits.

## Exclude problematic Airtable create tools when MCP schema validation fails

If an Airtable MCP server fails because specific create tools are breaking schema validation, rebuild or deploy the MCP server excluding only the affected create/base/table/field-style tools temporarily. The rest of the Airtable MCP server can continue working while the schema issue is fixed.

## Airtable triggers and webhooks were not yet generally available

If a customer asks for Airtable triggers or webhooks and the toolkit does not expose the needed trigger, treat it as a toolkit request rather than an implementation issue. Record the exact event they need on the public tool request board. Do not present missing trigger coverage as available unless it appears in the current toolkit.
