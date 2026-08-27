---
'@composio/core': patch
---

Omit empty-string file-uploadable arguments from tool execution requests instead of forwarding them to the backend, which rejected them with "Input should be a valid dictionary or instance of FileUploadable". This now also applies when `dangerouslyAllowAutoUploadDownloadFiles` is off, and with it on an empty value is no longer attempted as an upload.
