---
type: "reference"
title: "Notion"
description: "Public support knowledge for Notion."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "notion"
---
# Notion

## Use `NOTION_RETRIEVE_PAGE` instead of deprecated/invalid `NOTION_GET_PAGE`

`NOTION_GET_PAGE` is not the current valid slug. Use `NOTION_RETRIEVE_PAGE`, and verify available Notion tools from the marketplace/tool listing.

## Use the current Notion page and data-source update triggers

The current Notion catalog includes separate triggers for page creation, page
content updates, page property updates, and data-source schema updates. Choose
the trigger that matches the event rather than expecting a page-created trigger
to fire for edits. Fetch the current trigger catalog before implementation and
use the exact returned slug.

## Notion page/database access is granted per integration, not per Composio auth config token

Notion does not model access as normal OAuth scopes. Page/database access is granted per Notion integration/OAuth client ID through Notion “Capabilities” and workspace grants. If multiple Composio auth configs use the same underlying Notion integration, page authorization can overlap.

## Specifying a different auth config affects get/use lookup, not existing Notion token refresh

Existing connected accounts under a different auth config continue to refresh and work. Specifying an auth config affects which connection get/use functions look for; it does not rewrite refresh behavior for already-valid connected accounts.

## Notion 401 can be caused by invalid refresh token after user/admin revokes integration

A Notion refresh failure with “Invalid refresh token” is usually a token revocation issue. Common causes are the user disconnecting the integration in Notion settings or a workspace admin removing/blocking the integration.

## Use `NOTION_FETCH_DATA`, not `NOTION_FETCH_NOTION_DATA`

`NOTION_FETCH_NOTION_DATA` is not valid. Use `NOTION_FETCH_DATA` instead.

## Large unfiltered Notion responses can hurt agent quality

Large response payloads and overly complex structures can degrade agent behavior. Prefer narrower fetches/filters where available and track product improvements for simpler response structures.
