## Why am I getting 404 on `ONE_DRIVE_DOWNLOAD_FILE` for a shared file?

Items in "Shared" may be references to files stored in SharePoint, not actual files in the user's OneDrive. These references can't be downloaded via OneDrive endpoints.

To fix this, open the file's location in OneDrive or SharePoint, choose "Copy to" then "My files" to create a copy in the user's OneDrive, and download the copy. If you need programmatic access to SharePoint files, use the SharePoint APIs instead.

---
