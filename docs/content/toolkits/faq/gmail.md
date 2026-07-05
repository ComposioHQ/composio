## How do I set up custom Google OAuth credentials for Gmail?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Gmail?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Gmail API has not been used in project" error?

When using custom OAuth credentials, the Gmail API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why is my Gmail trigger slow?

Gmail triggers poll roughly every minute by default. If you need lower latency, consider using webhooks or Google Pub/Sub integrations.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

## How do I send an email with an attachment?

When using the Composio SDK, pass a local file path or a public URL directly as a string to the `attachment` field. The SDK's auto-upload feature (enabled by default) handles uploading the file and converting it to the required format. You do not need to construct the `{ s3key, name, mimetype }` object manually.

```python
result = composio.tools.execute(
    slug="GMAIL_SEND_EMAIL",
    user_id="user-123",
    arguments={
        "recipient_email": "recipient@example.com",
        "subject": "Report attached",
        "body": "See attached.",
        "attachment": "https://example.com/report.pdf",
    },
)
```

This approach works for any tool whose parameters accept file uploads. See [Automatic File Handling](/docs/tools-direct/executing-tools#automatic-file-handling) for more details.

---

## How do I create Gmail custom OAuth auth config, then initiate a connection with callback URL?

Create the Gmail auth config first with the custom OAuth credentials, then initiate a connected account using that auth config. The callback URL is supplied during connection initiation, while the OAuth client ID/secret and redirect URI live on the auth config.

## When should I use your own OAuth app for unverified sensitive Gmail scopes?

Composio managed Gmail OAuth is not verified for every sensitive Gmail scope. If a user needs sensitive granular scopes that are not verified on the managed app, use their own Google OAuth app with those scopes verified in Google Cloud Console.

## Why can Gmail filter setup show an app-blocked error?

If a user on Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, use your own Google OAuth app verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

## What should I know about the `gmail.send` scope?

`https://www.googleapis.com/auth/gmail.send` can send messages, but it is a granular sensitive scope and requires Google verification. The broader `https://mail.google.com/` scope gives full mailbox access and can cover send use cases, but it is broader than many users want.

## How do I configure Gmail scopes on managed auth config as a comma-joined scopes string?

When creating the Gmail auth config, pass the desired Gmail scopes in `credentials.scopes`, typically as a comma-joined string. Example scopes include `gmail.send`, `gmail.readonly`, `gmail.compose`, `gmail.modify`, and `gmail.labels`.

## When should I avoid `gmail.metadata` when fetching full Gmail email content?

The Gmail metadata scope cannot be used when requesting full email content. Remove `https://www.googleapis.com/auth/gmail.metadata` and use a scope that allows message content access, such as `https://mail.google.com/`, when full payload/body data is needed.

## Gmail attachments can make send-email slow enough to hit SDK request timeouts

`GMAIL_SEND_EMAIL` accepts attachments as uploaded Composio file references, not signed URLs or JSON strings. The action downloads the uploaded file, builds the MIME message, base64-url encodes it, and posts it to Gmail. Attachment sends can therefore take materially longer than small text-only sends.

If a user reports `GMAIL_SEND_EMAIL` hanging or duplicate sends with attachments:

We found this can happen when the client times out before the backend finishes the tool call. Since GMAIL_SEND_EMAIL is non-idempotent, a retry can create another sent email. Until this is fixed at the SDK/API level, disable retries for this call path and use a longer request timeout or server-side idempotency on your side where possible.

## When should I use `googlesuper` for one Google auth across Gmail, Calendar, Drive-style use cases?

The `googlesuper` toolkit can cover multi-service Google use cases with one Google auth app instead of separate toolkit connections, depending on the tools needed.
