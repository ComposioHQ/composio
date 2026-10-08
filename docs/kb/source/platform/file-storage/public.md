---
type: "reference"
title: "File Download Storage and Expiry"
description: "Public guidance for staged files, signed download URLs, retention, and size questions."
category: "sessions-and-execution"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "files"
  - "storage"
  - "signed-urls"
---
# File Download Storage and Expiry

## Composio file URLs are short-lived staged downloads

When a hosted tool returns a file URL such as `data.file.s3url`, Composio normally stages the bytes in Composio-managed object storage and returns a signed download URL rather than the provider's original URL.

The default signed-URL lifetime is one hour and can be configured for a project through its File TTL setting. Staged files are cleaned up after 24 hours. URL expiry and file cleanup are separate: rerun the tool or download the file again to obtain a fresh URL.

There is no single customer-facing maximum that applies to every tool. Provider limits, the action implementation, runtime memory, and timeouts can impose lower limits, so check the exact action before quoting a hard cap.
