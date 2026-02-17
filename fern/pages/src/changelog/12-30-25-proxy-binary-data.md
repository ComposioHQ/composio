## Binary Data Support for Proxy Execute

The `/api/v3/tools/execute/proxy` endpoint now supports binary data for both file uploads and downloads.

### File Uploads (`binary_body`)

To upload a file via the proxy, use the `binary_body` field in your request payload. This supports two approaches: specifying either a URL pointing to the file or providing the base64-encoded content directly.

#### Upload File via URL

```bash
curl --location 'https://backend.composio.dev/api/v3/tools/execute/proxy' \
  --header 'accept: application/json' \
  --header 'x-api-key: <YOUR_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
    "endpoint": "/upload-endpoint",
    "method": "POST",
    "connected_account_id": "<CONNECTED_ACCOUNT_ID>",
    "binary_body": {
      "url": "{URL_TO_THE_FILE}"
    }
  }'
```

#### Upload File via Base64 Content

Supported up to 4MB file size.

```bash
curl --location 'https://backend.composio.dev/api/v3/tools/execute/proxy' \
  --header 'accept: application/json' \
  --header 'x-api-key: <YOUR_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
    "endpoint": "/upload-endpoint",
    "method": "POST",
    "connected_account_id": "<CONNECTED_ACCOUNT_ID>",
    "binary_body": {
      "base64": "JVBERi0xLjQKJ...<base64_data>...",
      "content_type": "application/pdf"
    }
  }'
```

### File Downloads (`binary_data`)

When the proxied request returns a binary response (for example, a PDF or image), the proxy automatically uploads the file to temporary storage, and you receive a signed URL in the `binary_data` field. This enables you to download large files securely.

#### File Download Request

```bash
curl --location 'https://backend.composio.dev/api/v3/tools/execute/proxy' \
  --header 'accept: application/json' \
  --header 'x-api-key: <YOUR_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
    "endpoint": "{YOUR_ENDPOINT}",
    "method": "GET",
    "connected_account_id": "{YOUR_CONNECTED_ACCOUNT_ID}"
  }'
```

#### File Download Response

```json
{
  "data": {},
  "binary_data": {
    "url": "url to the file",
    "content_type": "content type of the file",
    "size": "size of the file",
    "expires_at": "expires at of the file"
  },
  "status": "status code of the response",
  "headers": "headers of the response"
}
```

### Summary

| Feature | Field | Description |
|---------|-------|-------------|
| File Upload via URL | `binary_body.url` | Provide a URL pointing to the file to upload |
| File Upload via Base64 | `binary_body.base64` + `binary_body.content_type` | Provide base64-encoded content (up to 4MB) |
| File Download | `binary_data` in response | Receive a signed URL to download binary responses |

We'd love your feedback on the new proxy execute capabilities. If anything feels unclear or you have suggestions for improvement, please reach out.
