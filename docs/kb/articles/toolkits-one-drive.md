Use this guide to configure OneDrive OAuth, execute current file tools, and control Tool Router sessions safely.

## Configure OneDrive OAuth and scopes

**Verify Azure app setup and recreate the auth config after changes.** For OneDrive custom OAuth failures, first verify the Azure OAuth app setup, especially credentials and redirect URLs. If the Azure app settings were changed, create a new Composio integration/auth config with the updated configuration and retry the connection.

**Derive Microsoft Graph permissions from the tools.** For OneDrive and other Microsoft Graph-backed toolkits, use `/api/v3/tools/get_scopes_required` with the relevant tool slugs to determine the scopes needed by those tools. This is more reliable than manually guessing Microsoft Graph delegated permissions.

## Use current OneDrive tools and file inputs

**Pass `version=latest` when folder behavior looks stale.** If OneDrive folder listing or related tool behavior appears stale, pass `version: "latest"` in the tool execution request so the call uses the latest toolkit version instead of the default pinned version.

**Use supported upload inputs for file actions.** OneDrive has upload/update tools such as `ONE_DRIVE_ONEDRIVE_UPLOAD_FILE` and `ONE_DRIVE_UPDATE_FILE_CONTENT`. Where the selected action supports it, pass file content through `FileUploadable` or the shared storage/data-URI path, including base64-backed uploads.

## Configure Tool Router sessions and safety

**Keep connected accounts under the same `user_id`.** In Tool Router v2, connected accounts used in one session should belong to the same `user_id`. When creating the session, pass the intended auth config IDs and make sure the connected accounts for OneDrive and the other toolkits are associated with that same user.

**Disable destructive actions with tags or exact tool slugs.** Use session-level tag controls to disable destructive tools globally or per toolkit. For OneDrive, disable the `destructiveHint` tag at the toolkit/session level, or disable exact tool slugs for finer-grained control.
