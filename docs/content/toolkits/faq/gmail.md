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

Your trigger is probably polling. Gmail triggers use webhooks on Composio-managed auth, so events arrive in seconds, but a trigger polls when:

- It was created as a polling trigger. Composio doesn't move existing triggers to webhooks; delete the trigger and create it again.
- You passed `type: "poll"` when you created it.
- Your own OAuth app has no complete Gmail webhook endpoint yet. See the next question.

A polling trigger waits up to its `polling_interval` between checks. [List the trigger](/docs/setting-up-triggers/managing-triggers#listing-active-triggers) and read its `type` and `fallback_reason` to see which case applies.

## How do I set up Gmail webhooks with my own OAuth app?

Gmail delivers mailbox changes through Google Cloud Pub/Sub. Set it up once per OAuth app, in the Google Cloud project that owns your OAuth client:

1. Enable the Gmail API and the Cloud Pub/Sub API.
2. Create a Pub/Sub topic. Its full name is `projects/<project-id>/topics/<topic-id>`. On the topic, grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role (`roles/pubsub.publisher`).
3. Create a service account only for push deliveries, for example `composio-gmail-push`. Give it no roles and create no keys: Pub/Sub uses it only to sign each push.
4. [Create a Gmail webhook endpoint](/docs/setting-up-triggers/custom-oauth-webhooks) with your OAuth client ID, and note its `webhook_url`.
5. Create a push subscription on the topic. Set its endpoint URL to the `webhook_url`, turn on authentication with the service account, and set the audience to the same `webhook_url`. Leave payload unwrapping off, and set the subscription to never expire.
6. Share your Pub/Sub details with Composio by [updating the endpoint](/docs/setting-up-triggers/custom-oauth-webhooks#updating-an-endpoint), a `PATCH` or `composio.webhooks.endpoints.update()` in the SDKs. Set `topic_name` to the topic's full name, `push_service_account_email` to the service account's email, and `push_audience` to the `webhook_url`.

Until the endpoint has all three fields, new Gmail triggers poll, and their `fallback_reason` says what's missing. Once it does, new triggers you create without `type` use the webhook straight away. That's why the fields come last, after the push subscription is delivering.

If pushes don't arrive, check that Pub/Sub's service agent, `service-<project-number>@gcp-sa-pubsub.iam.gserviceaccount.com`, can sign tokens for the service account. If it can't, grant it the Service Account Token Creator role on that account. Google documents its side in [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push).

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

## How do I send an email with an attachment?

Use a [session](/docs/quickstart) so your agent discovers the email tool at runtime instead of hard-coding an action slug.

1. [Connect Gmail for your user](/docs/authentication/manually-authenticating), then create a session for the same user and give your agent the session tools.
2. Upload `./report.pdf` to that session with the experimental `session.experimental.files` API. See [sandbox files and mounts](/docs/sandbox/remote#files-and-mounts) for Python, TypeScript, and API examples. The agent can read the uploaded file in the remote sandbox, not from your application's local filesystem.
3. Ask the agent to send the email with your recipient, subject, body, and the uploaded file's sandbox path. For a file mounted at `/mnt/files/report.pdf`, instruct it to use the sandbox's `get_mount_file_s3_key("report.pdf")` helper and pass the returned key to the discovered email tool in a file object with `name`, `mimetype`, and `s3key`. A sandbox path is not a storage key. See [session files and toolkit attachments](/reference/sdk-reference/typescript/session-files).
4. Check the tool result before reporting that the email was sent. If the tool fails, report the error.

Automatic file upload is off by default. This workflow uploads the file explicitly and does not require enabling automatic file handling. The session files API is experimental and may change.

## Why can Gmail filter setup show an app-blocked error?

If a user on Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, use your own Google OAuth app verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

## When should I avoid `gmail.metadata` when fetching full Gmail email content?

Use `https://www.googleapis.com/auth/gmail.metadata` only when the app needs message metadata such as labels and headers, not message bodies or payload content. Gmail treats `gmail.metadata` as a restricted metadata-only scope, and it is not compatible with broader content-access scopes such as `gmail.readonly`, `gmail.modify`, or `mail.google.com` in the same OAuth request.

If a tool needs full email content, remove `gmail.metadata` from the auth config and request a Gmail scope that allows message content access. Then reconnect the account so the new scope set is granted.
