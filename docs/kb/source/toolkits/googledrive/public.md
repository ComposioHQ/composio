---
type: "reference"
title: "Google Drive"
description: "Public support knowledge for Google Drive."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "googledrive"
---
# Google Drive


## Google Drive upload tools can accept local file paths or URLs through SDK auto file handling

For tools that support file-upload parameters such as `s3key`, `mimetype`, and `name`, the SDK can rewrite those parameters automatically. The caller can pass a local file path or URL string, and the SDK reads the file, uploads it to Composio-managed storage, and constructs the provider payload before executing the tool. For `GOOGLEDRIVE_UPLOAD_FILE`, passing `file_to_upload: "/path/to/file.pdf"` is the intended SDK pattern when auto file handling is enabled.

## Connect MCP exposes a curated Google Drive tool set and discovers the rest through meta-tools

This is expected for Connect MCP. The endpoint exposes a curated direct tool set so the assistant does not load hundreds or thousands of tools into context. Less common or higher-risk Google Drive actions, including `GOOGLEDRIVE_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION`, should be discovered at runtime with `COMPOSIO_SEARCH_TOOLS` and executed with `COMPOSIO_MULTI_EXECUTE_TOOL`.

## Google Drive watch/change webhooks require a public endpoint

Google Drive webhook payloads need to be delivered to a public domain or publicly reachable endpoint. A private-domain listener is not sufficient for Composio's server to send the webhook payload.

## Google Drive downloads use temporary presigned URLs with configurable URL TTL and short-lived storage

Downloaded files are staged in temporary S3-backed storage and exposed through presigned URLs. The default presigned URL TTL is 1 hour, and that URL expiration can be customized in Project Settings -> File TTL. The staged files themselves are short lived and are deleted from Composio storage after about 24 hours / one day.

## Disable SDK auto file handling when you need the raw Google Drive download output instead of a local path

If the SDK is converting downloaded file output into a local path and the application needs the raw URL or file payload, disable automatic file handling for the execution path. Use the documented `auto_upload_download_files=False` / disabling-auto-file-handling option, and make sure the relevant Composio SDK packages are upgraded to a version that supports that behavior.

## Use customer-owned Google OAuth credentials with verified scopes

Google can block the OAuth flow when the OAuth app is not verified for the requested sensitive or restricted scope. Configure and verify the required scope on the customer's Google Cloud OAuth app, then use those credentials in the Composio auth config. Also verify that the auth config requests only the intended scopes.

## A missing Google Drive tool can be caused by passing an invalid toolkit version

If a Google Drive tool appears missing, check whether the request is pinned to a toolkit version that exists. Passing an invalid version such as a non-existent dated version can make tools unavailable. Retry with a valid Google Drive toolkit version, or use the latest version when a pinned version is not required.

## For a Google Drive file-browser UI, prefer direct tool execution over MCP as the primary integration layer

Using Composio MCP for a Google Drive file browser is feasible, but MCP servers are designed primarily for AI assistant integrations. For a product UI or deterministic file browser, prefer Direct Tool Execution through the Composio SDK or APIs so the application controls the tool calls, arguments, and rendering flow directly.

## Use `GOOGLEDRIVE_GET_ABOUT` to confirm which Google Drive account is connected

Run `GOOGLEDRIVE_GET_ABOUT` for the connected account ID to confirm the email address and identity of the Google Drive account being used. This is the quickest check when actions appear to affect a different Drive account than expected.

## Google Drive tool execution requests should include an `arguments` object, even when it is empty

When calling tool execution APIs such as `GOOGLEDRIVE_FIND_FILE`, include the `arguments` object in the request body. If the tool does not need arguments for that call, send an empty object such as `"arguments": {}` along with the connected account, user/entity ID, and version fields.

## Tool Router v2 sessions require all connected accounts to belong to the same entity

Tool Router v2 sessions are scoped to a single entity/user ID. Every connected account included in a session must belong to that same entity, otherwise validation can fail with `ToolRouterV2_InvalidConnectedAccountIds`. Reconnect Google Drive under the same user/entity as the Gmail and Calendar accounts before combining them in one session. If needed, specify auth config IDs while creating the session so Manage Connection uses the intended auth config for each toolkit.

## Choose the narrowest Google Drive scope that supports the workflow

The `drive.file` scope allows access to files the app creates or that the user
explicitly grants to it. A workflow that needs broader full-drive access may
require the `drive` scope on the customer's Google OAuth app. Configure and
verify only the scopes the product actually needs.
