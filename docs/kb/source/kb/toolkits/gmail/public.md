---
type: reference
title: "Gmail"
description: "Customer-safe support knowledge for Gmail."
category: toolkits/gmail
visibility: public
timestamp: 2026-07-14T00:00:00Z
tags:
  - gmail
---
# Gmail

## Use `latest` or v3.1 for newer Gmail settings tools

The v3 execute endpoint can default to base toolkit version `00000000_00` when no version is specified. For newer Gmail tools like `GMAIL_PATCH_SEND_AS`, `GMAIL_LIST_SEND_AS`, and `GMAIL_GET_VACATION_SETTINGS`, pass `version: "latest"` in the execute body or use the v3.1 endpoint, which defaults to latest.

## Create Gmail custom OAuth auth config, then initiate a connection with callback URL

Create the Gmail auth config first with the custom OAuth credentials, then initiate a connected account using that auth config. The callback URL is supplied during connection initiation, while the OAuth client ID/secret and redirect URI live on the auth config.

## Use your own OAuth app for unverified sensitive Gmail scopes

Composio managed Gmail OAuth is not verified for every sensitive Gmail scope. If a customer needs sensitive granular scopes that are not verified on the managed app, use their own Google OAuth app with those scopes verified in Google Cloud Console.

## Creating Gmail filters requires `gmail.settings.basic`

Gmail filter creation maps to the Gmail API `users.settings.filters.create` endpoint: `POST /gmail/v1/users/{userId}/settings/filters`. Google lists `https://www.googleapis.com/auth/gmail.settings.basic` as the required OAuth scope for this endpoint, and the current Composio `GMAIL_CREATE_FILTER` action declares the same single required scope.

Do not tell customers that `https://mail.google.com/` or the current default Gmail managed scope set is a workaround for filter creation. Those scopes may cover other Gmail actions, but not `GMAIL_CREATE_FILTER`.

If a customer using Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, the unblock path is either:

1. Use a customer-owned Google OAuth app that is verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

2. Otherwise, filter creation cannot use the Composio-managed Gmail app until Composio confirms that `gmail.settings.basic` is approved and supported on that app. Reconnect only after that support is confirmed.

## `gmail.send` is granular but sensitive; `mail.google.com` gives full access

`https://www.googleapis.com/auth/gmail.send` can send messages, but it is a granular sensitive scope and requires Google verification. The broader `https://mail.google.com/` scope gives full mailbox access and can cover send use cases, but it is broader than many customers want.

## Configure Gmail scopes on managed auth config as a comma-joined scopes string

When creating the Gmail auth config, pass the desired Gmail scopes in `credentials.scopes`, typically as a comma-joined string. Example scopes include `gmail.send`, `gmail.readonly`, `gmail.compose`, `gmail.modify`, and `gmail.labels`.

## Avoid `gmail.metadata` when fetching full Gmail email content

The Gmail metadata scope cannot be used when requesting full email content. Remove `https://www.googleapis.com/auth/gmail.metadata` and use a scope that allows message content access, such as `https://mail.google.com/`, when full payload/body data is needed.

## Use `me` for Gmail `user_id` in tool calls

For Gmail tool calls, `me` can be used as the `user_id` to refer to the authenticated connected account.

## `GMAIL_SEND_EMAIL` accepts at least one of `to`, `cc`, or `bcc`

`GMAIL_SEND_EMAIL` no longer needs a single required recipient field. At least one recipient channel such as `to` / `recipient_email`, `cc`, or `bcc` can be supplied, which keeps the tool flexible for different email composition flows.

For hosted MCP / Tool Router calls through `COMPOSIO_MULTI_EXECUTE_TOOL`, put recipient fields inside the nested tool `arguments` object. Prefer `recipient_email` for the first To recipient and `extra_recipients` for additional To recipients unless the current schema explicitly exposes another shape.

If the connection is active but the action returns `At least one of 'to' (or 'recipient_email'), 'cc', or 'bcc' must be provided`, the tool did not receive a recipient channel and failed before Gmail API execution. Retry with the exact nested `recipient_email` shape; if it still fails, provide a fresh request ID for investigation.

## For Gmail attachments over MCP, upload files before tool execution

Temporary S3/file instances are short-lived. Use `files.upload` before tool execution via the SDK or MCP flow, then pass the resulting `FileUploadable`/uploaded file object to the agent/tool call.

## Gmail attachments can make send-email slow enough to hit SDK request timeouts

`GMAIL_SEND_EMAIL` accepts attachments as uploaded Composio file references, not signed URLs or JSON strings. The action downloads the uploaded file, builds the MIME message, base64-url encodes it, and posts it to Gmail. Attachment sends can therefore take materially longer than small text-only sends.

If a customer reports `GMAIL_SEND_EMAIL` hanging or duplicate sends with attachments:

- If the log is a fast 400 validation error, verify the `attachment` argument is an object/list with `name`, `mimetype`, and `s3key`.

Customer-safe wording:

```text
We found this can happen when the client times out before the backend finishes the tool call. Since GMAIL_SEND_EMAIL is non-idempotent, a retry can create another sent email. Until this is fixed at the SDK/API level, disable retries for this call path and use a longer request timeout or server-side idempotency on your side where possible.
```

## Reduce Gmail fetch payload size with `include_payload=false`, `verbose=false`, `only_ids`, query, and limits

For Gmail fetch/list flows, reduce payload by setting `include_payload=false` and `verbose=false` where supported. For very lightweight flows, use `only_ids=true` and then fetch selected messages separately. Also use `max_results` and Gmail `query` filters to keep result sets small.

## Verbose Gmail thread results cannot select custom fields and may not be chronological

Custom field selection is not supported in that verbose mode because it would increase payload size and latency. When `verbose=true`, thread work can run concurrently, so returned results may be ordered by completion rather than strict chronology.

## Use `from_email` to select Gmail send-as alias

Use the `from_email` parameter on `GMAIL_SEND_EMAIL` to choose the Gmail send-as alias.

## Use Gmail label IDs, not label names, for label operations

For Gmail label operations and trigger label filters that require IDs, pass the label ID rather than the display name. Use `GMAIL_LIST_LABELS` to retrieve IDs.

## Patch Gmail label colors with `background_color` and accepted color values

To patch a label color, use the label ID and pass background color as an object field such as `{ "background_color": "#FFFF0000" }`. Gmail only accepts specific label color values from the Gmail API reference.

## Filter Gmail new-message trigger by label/query instead of label IDs

For Gmail new-message trigger setup, use a Gmail query such as `label:sent OR label:category_personal` to filter matching messages. This avoids depending on label IDs for that trigger path.

## Use `googlesuper` for one Google auth across Gmail, Calendar, Drive-style use cases

Google Super owns the canonical multi-service authentication guidance. See [Google Super is a unified Google Workspace toolkit](../googlesuper/public.md#google-super-is-a-unified-google-workspace-toolkit).
