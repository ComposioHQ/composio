---
type: "reference"
title: "Airtable"
description: "Public support knowledge for Airtable."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "airtable"
---
# Airtable

The sections below provide public guidance for Airtable.

## Connect Airtable to Claude using MCP

Airtable can be connected to Claude through Composio MCP. Create or use an MCP server with Airtable tools selected, add the MCP server configuration to Claude, and complete the Airtable account connection from the MCP/connect flow.

## Use custom Airtable OAuth credentials for additional scopes

For additional Airtable scopes, use your own Airtable OAuth developer app. Configure the required scopes in Airtable, enable/use custom OAuth credentials in Composio, and create a new integration/auth config with those credentials and scopes. If an existing integration was created before the scope change, create a new one and retry the connection.

## Connection initiation timeout after 10 minutes is not Airtable-specific

The expiry reason "Connection initiation did not complete within 10 minutes" means the user opened or initiated the connection but did not finish the authentication flow within ten minutes. It is a generic connected-account timeout across toolkits, not an Airtable-specific error. Start a fresh connection/initiation link and complete the OAuth flow within the allowed window.

## Missing Airtable tools may be caused by list limits or an older toolkit version

If Airtable tools appear missing, first increase the tools list limit or paginate
because the response may contain only the first page. Explicitly request the
latest toolkit version when a pinned version lacks a current action. Old names
such as `create_multiple_records` and `create_record` were deprecated in favor
of current uppercase slugs such as `AIRTABLE_CREATE_RECORDS`.

## AIRTABLE_UPDATE_MULTIPLE_RECORDS updates at most 10 records per call

`AIRTABLE_UPDATE_MULTIPLE_RECORDS` can update a maximum of 10 Airtable records at a time. For larger updates, split the records into batches of 10 and execute multiple calls while respecting Airtable's API rate limits.

## Use one of the current Airtable metadata triggers

The current Airtable toolkit exposes triggers for base metadata changes, base schema changes, user profile changes, and view creation, deletion, or metadata changes. Fetch the current trigger catalog before implementation and use the exact returned slug. If the needed event is not in that catalog, file a trigger request for that specific Airtable event.
