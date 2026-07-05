## Why am I getting 404 on `ONE_DRIVE_DOWNLOAD_FILE` for a shared file?


Items in "Shared" may be references to files stored in SharePoint, not actual files in the user's OneDrive. These references can't be downloaded via OneDrive endpoints.

To fix this, open the file's location in OneDrive or SharePoint, choose "Copy to" then "My files" to create a copy in the user's OneDrive, and download the copy. If you need programmatic access to SharePoint files, use the SharePoint APIs instead.

---

## OneDrive custom OAuth issues usually require verifying Azure app setup and recreating the integration


For OneDrive custom OAuth failures, first verify the Azure OAuth app setup, especially credentials and redirect URLs. If the Azure app settings were changed, create a new Composio integration/auth config with the updated configuration and retry the connection.

## When should I use the scopes-required endpoint to derive OneDrive/Microsoft Graph permissions?


For OneDrive and other Microsoft Graph-backed toolkits, use `/api/v3/tools/get_scopes_required` with the relevant tool slugs to determine the scopes needed by those tools. This is more reliable than manually guessing Microsoft Graph delegated permissions.

## Tool Router v2 sessions should keep all connected accounts under the same `user_id`


In Tool Router v2, connected accounts used in one session should belong to the same `user_id`. When creating the session, pass the intended auth config IDs and make sure the connected accounts for OneDrive and the other toolkits are associated with that same user.

## Disable OneDrive destructive actions with `destructiveHint` or explicit tool disables


Use session-level tag controls to disable destructive tools globally or per toolkit. For OneDrive, disable the `destructiveHint` tag at the toolkit/session level, or disable exact tool slugs if the user needs finer-grained control.

## Deleting a OneDrive connection may not revoke provider-side tokens


Use the connected-account revoke endpoint when the goal is to invalidate the provider token. Deleting a Composio connection record does not always revoke that token; for Microsoft/Google-style admin-consented apps, the provider may require direct removal from the admin console if revocation is not accepted.
