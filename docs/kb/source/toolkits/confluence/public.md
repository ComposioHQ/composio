---
type: "reference"
title: "Confluence"
description: "Public support knowledge for Confluence."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "confluence"
---
# Confluence


## Confluence custom OAuth should keep scopes aligned with Composio defaults and endpoint type

For Confluence custom OAuth, keep Atlassian scopes aligned with the scopes Composio expects. Classic and granular scopes differ depending on whether the underlying Confluence endpoint is v1 or v2. Incorrect substitutions such as using an irrelevant space scope can cause tool execution errors even if OAuth completes.

## Add `offline_access` to Confluence auth configs when refresh tokens are needed

For Confluence OAuth, include the `offline_access` scope in the auth config and then create a new connected account. `offline_access` enables token refresh, and adding it to an existing auth config only affects new connections after users reconnect.

## Use connected account ID, not auth config ID, when executing Confluence tools

For Confluence tool execution, pass the connected account ID. Do not pass the auth config ID/integration ID in the connected account field. Older SDK versions may also require the UUID form rather than the nano ID, so verify the SDK version and expected ID format.

## Use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content

Use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content by page ID. This is the tool support shared for page body retrieval.

## `CONFLUENCE_UPDATE_PAGE` should be paired with `CONFLUENCE_GET_PAGE_VERSIONS` for versioned updates

Confluence page updates require the correct page version. Pair `CONFLUENCE_UPDATE_PAGE` with `CONFLUENCE_GET_PAGE_VERSIONS` so the agent can fetch the latest required version and then update the page. By default, the agent should update over the latest version unless a specific version is requested.

## Download Confluence attachments by first getting attachment IDs

Use `CONFLUENCE_GET_ATTACHMENTS` to list attachments and get the attachment ID, then pass that ID to `CONFLUENCE_DOWNLOAD_ATTACHMENT` to download the file.

## Confluence tool scopes are exposed in MCP listTools annotations for supported deployments

For supported MCP deployments, Confluence scopes can be retrieved from the `annotations` field in the `listTools` API response.

## For Atlassian/Confluence OAuth, use the same redirect URI in auth config and Atlassian app

The redirect URI in the Composio auth config and the Atlassian OAuth app must match. Copy the callback shown by the current auth-config flow or documentation; do not reuse legacy v1 or v3 callback paths from old support answers.
