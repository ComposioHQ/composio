---
type: "reference"
title: "OneDrive"
description: "Public support knowledge for OneDrive."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "one_drive"
---
# OneDrive


## OneDrive custom OAuth issues usually require verifying Azure app setup and recreating the integration

For OneDrive custom OAuth failures, first verify the Azure OAuth app setup, especially credentials and redirect URLs. If the Azure app settings were changed, create a new Composio integration/auth config with the updated configuration and retry the connection.

## Use the scopes-required endpoint to derive OneDrive/Microsoft Graph permissions

For OneDrive and other Microsoft Graph-backed toolkits, use `/api/v3/tools/get_scopes_required` with the relevant tool slugs to determine the scopes needed by those tools. This is more reliable than manually guessing Microsoft Graph delegated permissions.

## Pass `version=latest` if OneDrive folder/list behavior looks stale

If OneDrive folder listing or related tool behavior appears stale, ask the customer to pass `version: "latest"` in the tool execution request so the call uses the latest toolkit version instead of the default pinned version.

## Use file-uploadable or base64-compatible inputs for supported OneDrive actions

OneDrive has upload/update tools such as `ONE_DRIVE_ONEDRIVE_UPLOAD_FILE` and `ONE_DRIVE_UPDATE_FILE_CONTENT`. Where the selected action supports it, pass file content through `FileUploadable` or the shared storage/data-URI path, including base64-backed uploads.

## Tool Router v2 sessions should keep all connected accounts under the same `user_id`

In Tool Router v2, connected accounts used in one session should belong to the same `user_id`. When creating the session, pass the intended auth config IDs and make sure the connected accounts for OneDrive and the other toolkits are associated with that same user.

## Disable OneDrive destructive actions with `destructiveHint` or explicit tool disables

Use session-level tag controls to disable destructive tools globally or per toolkit. For OneDrive, disable the `destructiveHint` tag at the toolkit/session level, or disable exact tool slugs if the customer needs finer-grained control.
