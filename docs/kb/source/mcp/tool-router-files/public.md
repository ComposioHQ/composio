---
type: "troubleshooting"
title: "Tool Router Files"
description: "Public guidance for passing Tool Router session files to toolkit actions."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-14T00:00:00Z"
tags:
  - "mcp"
  - "tool-router"
  - "files"
  - "uploads"
---
# Tool Router Files

## Session paths are not `FileUploadable` storage keys

Tool Router session files and toolkit `FileUploadable` inputs are different abstractions. Do not pass `/workspace/output/...`, `/mnt/files/...`, a local machine path, or an old/foreign `file_...` handle directly as `s3key`.

When workbench/meta tools are available:

- For a file already under `/mnt/files`, use `get_mount_file_s3_key("file.ext")`.
- For another sandbox path, use `upload_local_file("/path/to/file.ext")`.
- Pass the returned key to the toolkit action as `{ "name": "file.ext", "mimetype": "...", "s3key": "<returned key>" }`.

In SDK/API flows, upload or stage the file first and pass the fresh returned file object.

If an action reports `Failed to download file with s3key ... storage returned HTTP 404`, it failed while resolving the Composio-staged file, before the provider received it. Re-stage the file and retry with the fresh object.
