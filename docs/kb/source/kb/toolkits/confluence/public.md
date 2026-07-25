---
type: reference
title: "Confluence"
description: "Customer-safe support knowledge for Confluence."
category: toolkits/confluence
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - confluence
---
# Confluence


## Confluence managed OAuth failures can come from scope mismatch between auth config and OAuth app

If Confluence OAuth fails with the managed app, compare the scopes configured in the auth config with the scopes configured on the Atlassian OAuth app. A mismatch can break connection. Workarounds are to use a customer-owned OAuth app with the correct scopes, or replace the auth config scopes with the supported Confluence scope set while the managed app is fixed.

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

The redirect URI in the Composio auth config and the Atlassian OAuth app must match. For v3, the correct callback path is `https://backend.composio.dev/api/v3/toolkits/auth/callback`; `https://backend.composio.dev/api/v3/auth-apps/add` is not a callback URL.

## Page-created triggers can auto-disable after repeated cloud-ID lookup failures

A `CONFLUENCE_PAGE_CREATED_TRIGGER` can become inactive while normal Confluence tools still work. In the known pattern, Atlassian rejects the bearer token used by the polling trigger's cloud-ID lookup, repeated polls fail, and Composio disables the trigger for safety.

Do not assume missing scopes when the account is active and regular tools succeed. Re-enabling can be temporary if the polling failure continues. Share the trigger ID and disable time with support so the polling path can be checked.
