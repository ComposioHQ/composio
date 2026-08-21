Use this guide to discover, read, create, and connect Google Slides presentations in Composio.

## Discover and read Google Slides presentations

**Discover presentations through Google Drive.** Google Slides does not offer a dedicated endpoint to list all presentations through the Slides toolkit. Use `GOOGLEDRIVE_FIND_FILE` and filter Drive files with `q`, for example `mimeType = 'application/vnd.google-apps.presentation'`, then pass the returned presentation ID into the Google Slides tool.

**Pass the presentation ID to `GOOGLESLIDES_PRESENTATIONS_GET`.** `GOOGLESLIDES_PRESENTATIONS_GET` should be called with the Google Slides presentation ID. Get that ID from the presentation URL, or use the ID returned by `GOOGLEDRIVE_FIND_FILE` when discovering presentations through Drive.

**Use the same Google account for discovery and reading.** When a workflow discovers presentations with `GOOGLEDRIVE_FIND_FILE` and then reads them with `GOOGLESLIDES_PRESENTATIONS_GET`, make sure the connected Google Drive and Google Slides accounts are the same account. Otherwise the ID may be valid in Drive discovery but inaccessible to the Slides connection.

## Create and connect Google Slides workflows

**Create presentations through Google Super.** Google Slide creation tools were added to the Google Super toolkit. For slide creation workflows, use the relevant Google Super tools rather than trying to create a native Slides file through generic Drive text upload.

**Verify custom OAuth apps for sensitive scopes.** When using a custom Google developer app for Google Slides, the app must be verified for the sensitive Google scopes it requests. Without verification, Google may block or warn on the OAuth consent flow.

**Use the supported Google Slides trigger.** Google Slides is listed as a trigger-capable toolkit in Composio with one supported trigger.
