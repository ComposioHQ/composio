## How do I set up custom Google OAuth credentials for Gmail?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Gmail?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Gmail API has not been used in project" error?

When using custom OAuth credentials, the Gmail API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why is my Gmail trigger slow?

Gmail triggers poll roughly every minute by default. If you need lower latency, consider using webhooks or Google Pub/Sub integrations.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

## How do I send an email with an attachment?

Save the attachment as `report.pdf` in the directory you run the example from. Automatic file upload is off by default, so the SDK examples enable it and allow uploads only from that directory; the API option shows the same staging requests explicitly. The `user-123` identity must already have an active Gmail connection.

These examples deliberately use `latest` and opt out of the SDK version guard. Pin a tested [toolkit version](/docs/tools-direct/toolkit-versioning) in production.

### Python
```python
import os

from composio import Composio

composio = Composio(
    dangerously_allow_auto_upload_download_files=True,
    file_upload_dirs=[os.getcwd()],
)

result = composio.tools.execute(
    slug="GMAIL_SEND_EMAIL",
    user_id="user-123",
    version="latest",
    dangerously_skip_version_check=True,
    arguments={
        "recipient_email": "recipient@example.com",
        "subject": "Report attached",
        "body": "See attached.",
        "attachment": "./report.pdf",
    },
)
```

### TypeScript
```typescript
import { Composio } from "@composio/core";

const composio = new Composio({
  dangerouslyAllowAutoUploadDownloadFiles: true,
  fileUploadDirs: [process.cwd()],
});

const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
  userId: "user-123",
  version: "latest",
  dangerouslySkipVersionCheck: true,
  arguments: {
    recipient_email: "recipient@example.com",
    subject: "Report attached",
    body: "See attached.",
    attachment: "./report.pdf",
  },
});
```

### API

```bash
MD5=$(openssl dgst -md5 -r report.pdf | cut -d ' ' -f 1)
UPLOAD=$(curl --fail-with-body -s -X POST https://backend.composio.dev/api/v3.1/files/upload/request \
  -H "x-api-key: $COMPOSIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"toolkit_slug":"gmail","tool_slug":"GMAIL_SEND_EMAIL","filename":"report.pdf","mimetype":"application/pdf","md5":"'"$MD5"'"}')
UPLOAD_URL=$(echo "$UPLOAD" | jq -r '.new_presigned_url')
KEY=$(echo "$UPLOAD" | jq -r '.key')
BACKEND=$(echo "$UPLOAD" | jq -r '.metadata.storage_backend')
if [ "$BACKEND" = "azure_blob_storage" ]; then
  curl --fail-with-body -X PUT "$UPLOAD_URL" --data-binary @report.pdf \
    -H "Content-Type: application/pdf" -H "x-ms-blob-type: BlockBlob"
else
  curl --fail-with-body -X PUT "$UPLOAD_URL" --data-binary @report.pdf \
    -H "Content-Type: application/pdf"
fi
curl --fail-with-body -X POST https://backend.composio.dev/api/v3.1/tools/execute/GMAIL_SEND_EMAIL \
  -H "x-api-key: $COMPOSIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":"user-123",
    "version":"latest",
    "arguments":{
      "recipient_email":"recipient@example.com",
      "subject":"Report attached",
      "body":"See attached.",
      "attachment":{"name":"report.pdf","mimetype":"application/pdf","s3key":"'"$KEY"'"}
    }
  }'
```

<!-- end-languages -->

This approach works for any tool whose parameters accept file uploads. See [Automatic File Handling](/docs/tools-direct/executing-tools#automatic-file-handling) for more details.

## Why can Gmail filter setup show an app-blocked error?

If a user on Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, use your own Google OAuth app verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

## When should I avoid `gmail.metadata` when fetching full Gmail email content?

Use `https://www.googleapis.com/auth/gmail.metadata` only when the app needs message metadata such as labels and headers, not message bodies or payload content. Gmail treats `gmail.metadata` as a restricted metadata-only scope, and it is not compatible with broader content-access scopes such as `gmail.readonly`, `gmail.modify`, or `mail.google.com` in the same OAuth request.

If a tool needs full email content, remove `gmail.metadata` from the auth config and request a Gmail scope that allows message content access. Then reconnect the account so the new scope set is granted.
