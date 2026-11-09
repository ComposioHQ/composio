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

Use a [session](/docs/quickstart) so your agent discovers the email tool at runtime instead of hard-coding an action slug.

1. [Connect Gmail for your user](/docs/authentication/manually-authenticating), then create a session for the same user and give your agent the session tools.
2. Upload `./report.pdf` to that session with the experimental `session.experimental.files` API. See [sandbox files and mounts](/docs/sandbox/remote#files-and-mounts) for Python, TypeScript, and API examples. The agent can read the uploaded file in the remote sandbox, not from your application's local filesystem.
3. Ask the agent to send the email with your recipient, subject, body, and the uploaded file's sandbox path. For a file mounted at `/mnt/files/report.pdf`, instruct it to use the sandbox's `get_mount_file_s3_key("report.pdf")` helper and pass the returned key to the discovered email tool in a file object with `name`, `mimetype`, and `s3key`. A sandbox path is not a storage key. See [session files and toolkit attachments](/kb/guide/mcp-tool-router-files).
4. Check the tool result before reporting that the email was sent. If the tool fails, report the error.

Automatic file upload is off by default. This workflow uploads the file explicitly and does not require enabling automatic file handling. The session files API is experimental and may change.

## Why can Gmail filter setup show an app-blocked error?

If a user on Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, use your own Google OAuth app verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

## When should I avoid `gmail.metadata` when fetching full Gmail email content?

Use `https://www.googleapis.com/auth/gmail.metadata` only when the app needs message metadata such as labels and headers, not message bodies or payload content. Gmail treats `gmail.metadata` as a restricted metadata-only scope, and it is not compatible with broader content-access scopes such as `gmail.readonly`, `gmail.modify`, or `mail.google.com` in the same OAuth request.

If a tool needs full email content, remove `gmail.metadata` from the auth config and request a Gmail scope that allows message content access. Then reconnect the account so the new scope set is granted.
