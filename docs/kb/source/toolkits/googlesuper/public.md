---
type: "reference"
title: "Google Super"
description: "Public support knowledge for Google Super."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "googlesuper"
---
# Google Super

## Google Super is a unified Google Workspace toolkit

Google Super is a unified/superset toolkit for Google Workspace services. It can cover tools across Gmail, Google Calendar, Google Meet, and related Google APIs through one Google Super connection when the required scopes are configured.

## Google Meet through Google Super needs Meet scopes and Google Meet API enabled

To use Google Meet tools through Google Super, configure `https://www.googleapis.com/auth/meetings.space.created` and `https://www.googleapis.com/auth/meetings.space.settings` in the Google Super auth config, create a new connection for the scope changes to apply, and enable the Google Meet API in Google Cloud Console.

## Google Super can be narrowed by removing unneeded scopes and tools

Google Super can cover all Google services including Gmail, but customers can remove scopes and tools they do not want as part of the Google Super auth/tool configuration. Make sure the remaining scopes still cover the tools the customer expects to use.

## Gmail filter creation through Google Super also requires `gmail.settings.basic`

Google Super uses the same underlying Gmail API requirement for filter creation. See the canonical Gmail guidance: [Creating Gmail filters requires `gmail.settings.basic`](../gmail/public.md#creating-gmail-filters-requires-gmailsettingsbasic).

## `GOOGLESUPER_LIST_LABELS` with `include_details=true` can be slow because it fans out per label

For `GOOGLESUPER_LIST_LABELS`, setting `include_details=true` fans out into one Gmail API call per label. Accounts with many labels can become slow because the calls happen sequentially. Set `include_details=false` or omit the parameter to return to a single API call and much lower latency.

## Gmail thread listing includes `resultSizeEstimate`

The current Gmail thread-listing response includes `resultSizeEstimate`. If it is absent through an older pinned Google Super toolkit version, compare its schema with the latest version before changing application logic.

## Use Gmail/Google Super query and label filters to find sent or labeled messages

Gmail/Google Super tools are wrappers over Google APIs, so use Gmail-style `query` filters or `label_ids` where supported to filter messages, including sent-mail style queries. If the exact filter is not exposed, file a tool request for the endpoint/parameter.

## Google Super Sheets 404s can mean wrong spreadsheet ID, missing access, or missing spreadsheet scope

For Google Super Sheets 404s, first verify the spreadsheet ID, confirm the sheet is shared with the connected Google account, and ensure the connection has `https://www.googleapis.com/auth/spreadsheets`. If those are all correct and only one tool fails, treat it as a tool-specific issue and escalate with the request/response payload.

## `Connection initiation did not complete within 10 minutes` means OAuth consent was not completed, not token refresh failure

If expired connections share status reason `Connection initiation did not complete within 10 minutes`, the OAuth flow was initiated but the user did not complete consent within the 10-minute window. No provider tokens were issued in that case, so it is not a 1-2 week refresh token expiry problem.

## Google users can deselect scopes during consent; Composio marks active if token exchange succeeds

Google lets users selectively deselect scopes during consent. Composio marks the connection active as long as token exchange succeeds, even if the final granted scopes are a subset of the auth config's requested scopes. The auth config scopes are the blueprint, but the final permissions are decided by the end user on the consent screen.
