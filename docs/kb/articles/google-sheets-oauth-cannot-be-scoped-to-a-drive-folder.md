A Drive folder is not an OAuth authorization boundary. You cannot restrict a Google Sheets connection to one folder merely by choosing that folder in Composio or relying on its membership.

## Choose a narrower design when needed

Use the narrowest Google scope that supports the workflow. Where it fits, `drive.file` can limit access to files the user explicitly opens with or shares with the app. For stronger product-specific restrictions, maintain an application-level allowlist of spreadsheet IDs.

Folder membership alone does not constrain the OAuth token, and broad Drive scopes may still be appropriate for workflows that need them. Configure the connection through [Composio authentication](/docs/authentication), then apply file sharing and your own application controls deliberately.

Google documents the available choices in its [Drive API scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
