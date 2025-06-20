# Auto Upload and Download Files

Composio SDK includes an automatic file handling system that manages file uploads and downloads when executing tools. This guide explains how the system works, how to configure it, and how to handle files manually when auto-handling is disabled.

## Overview

The file handling system in Composio SDK is:

- **Opt-out**: Enabled by default but can be disabled
- **Automatic**: Handles file uploads and downloads transparently
- **Configurable**: Can be disabled for manual file handling

## How It Works

### File Upload

When a tool's input parameter is marked with `file_uploadable: true`, the SDK will:

1. Automatically detect file paths in the input
2. Upload the file to Composio's secure storage
3. Replace the file path with file metadata in the tool execution

Example tool schema with file upload:

```typescript
const toolSchema = {
  inputParameters: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        file_uploadable: true
      }
    }
  }
}
```

When executing a tool with file upload:

```typescript
// With auto upload enabled (default)
const result = await composio.tools.execute('your-tool', {
  arguments: {
    file: '/path/to/local/file.txt'  // Local file path
    // or
    file: 'https://example.com/file.txt'  // Remote URL
  }
});

// The SDK automatically:
// 1. Reads the file content
// 2. Uploads it to S3
// 3. Replaces the path with metadata:
// {
//   name: string;      // The original filename
//   mimetype: string;  // The file's mime type
//   s3key: string;     // The S3 key for the uploaded file
// }
```

### File Download

When a tool's output contains an S3 URL and mimetype, the SDK will:

1. Automatically detect file URLs in the response
2. Download the file to a local temporary directory
3. Replace the S3 URL with local file information

Example tool response with file download:

```typescript
// Original response from tool
{
  data: {
    file: {
      s3url: 'https://s3.example.com/file.txt',
      mimetype: 'text/plain'
    }
  }
}

// After auto-download
{
  data: {
    file: {
      uri: '/path/to/local/file.txt',
      file_downloaded: true,
      s3url: 'https://s3.example.com/file.txt',
      mimeType: 'text/plain'
    }
  }
}
```

## Disabling Auto File Handling

You can disable automatic file handling when initializing the SDK:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: 'your-api-key',
  autoUploadDownloadFiles: false
});
```

## Manual File Handling

When auto file handling is disabled, you'll need to handle the file operations yourself using the `composio.files` API:

### Manual Upload

When auto-upload is disabled, you need to handle file uploads manually:

```typescript
// Upload file manually
const fileData = await composio.files.upload({
  filePath: '/path/to/file.txt',  // Local path or URL
  toolSlug: 'your-tool',          // Tool slug
  toolkitSlug: 'your-toolkit'     // Toolkit slug
});

// Execute tool with file data
const result = await composio.tools.execute('your-tool', {
  arguments: {
    file: fileData  // Contains name, mimetype, and s3key
  }
});
```

### Manual Download

When auto-download is disabled, you'll need to handle file downloads manually:

```typescript
// Execute tool
const result = await composio.tools.execute('your-tool', {
  arguments: {
    // your arguments
  }
});

// Download file manually if response contains S3 URL
if (result.data.file?.s3url) {
  const downloadedFile = await composio.files.download({
    s3Url: result.data.file.s3url,
    toolSlug: 'your-tool',
    mimeType: result.data.file.mimetype || 'application/txt'
  });
  
  // downloadedFile contains:
  // {
  //   name: string;       // Generated filename (toolSlug_timestamp.ext)
  //   mimeType: string;   // The file's mime type
  //   s3Url: string;      // The original S3 URL
  //   filePath: string;   // Local path to the downloaded file
  // }
}
```

## File Storage Location

Downloaded files are stored in a temporary directory:

- Location: `~/.composio/files/` (user's home directory)
- Files are named using the pattern: `{toolSlug}_{timestamp}.{extension}`
- The directory is created automatically when needed
- File extensions are derived from the MIME type

## Error Handling

The SDK includes specific error types for file operations:

```typescript
import { ComposioFileUploadError } from '@composio/core';

try {
  await composio.tools.execute('your-tool', {
    arguments: {
      file: '/path/to/file.txt'
    }
  });
} catch (error) {
  if (error instanceof ComposioFileUploadError) {
    console.error('File upload failed:', error.message);
    // Handle file upload error
    // Possible fixes will be included in error.possibleFixes
  }
  throw error;
}
```

## Additional Features

- **URL Support**: The file upload system supports both local file paths and URLs
- **MIME Type Detection**: Automatically detects MIME types from files and URLs
- **Automatic Directory Creation**: Creates necessary directories for file storage
- **Error Recovery**: Provides graceful error handling with helpful error messages
- **MD5 Checksum**: Generates MD5 checksums for file integrity verification
