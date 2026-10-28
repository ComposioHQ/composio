---
'@composio/core': patch
---

Upload local files with the MIME type of their extension

A file uploaded from a local path used to be sent as `application/octet-stream` whatever it was, so tools that check the file's type, such as Canva's design import, rejected it. The SDK now infers the type from the file name's extension (a `.pptx` uploads as `application/vnd.openxmlformats-officedocument.presentationml.presentation`) and keeps `application/octet-stream` only for missing or unknown extensions, as the Python SDK does. Files passed as `File` objects and URLs keep the type they carry.
