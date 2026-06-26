## How do I set up custom Google OAuth credentials for Google Super?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Super?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting the "API has not been used in project" error?

When using custom OAuth credentials, the required Google API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

---

## What does Google Super mean?

Google Super is a unified/superset toolkit for Google Workspace services. It can cover tools across Gmail, Google Calendar, Google Meet, and related Google APIs through one Google Super connection when the required scopes are configured.

## What does Google Meet through Google Super need?

To use Google Meet tools through Google Super, configure the required Meet scopes in the Google Super auth config, create a new connection for the scope changes to apply, and enable the Google Meet API in Google Cloud Console. Common Meet scopes include `https://www.googleapis.com/auth/meetings.space.created` and `https://www.googleapis.com/auth/meetings.space.settings`.

## How should I handle managed Google Super OAuth issues can be unblocked by switching to a custom Google OAuth config?

Google Super managed OAuth can be affected independently from other Google managed apps. If managed Google Super OAuth fails with token-exchange 401, `access_denied`, or verification-related errors, use a custom Google OAuth auth config with the user's own credentials and verified scopes.

## How should I handle google Super can be narrowed by removing unneeded scopes and tools?

Google Super can cover all Google services including Gmail, but users can remove scopes and tools they do not want as part of the Google Super auth/tool configuration. Make sure the remaining scopes still cover the tools the user expects to use.

## What does Gmail filter creation through Google Super also require?

Google Super can cover Gmail workflows through one Google connection, but Gmail filter creation still follows the underlying Gmail API scope requirement. The `users.settings.filters.create` endpoint requires `https://www.googleapis.com/auth/gmail.settings.basic` specifically.

## How should I handle `GOOGLESUPER_LIST_LABELS` with `include_details=true` can be slow because it fans out per label?

For `GOOGLESUPER_LIST_LABELS`, setting `include_details=true` fans out into one Gmail API call per label. Accounts with many labels can become slow because the calls happen sequentially. Set `include_details=false` or omit the parameter to return to a single API call and much lower latency.

## How should I handle `GOOGLESUPER_LIST_THREADS` verbose behavior trades payload/latency for detail and may return completion order?

Selecting arbitrary fields is not supported in the thread-list response because it would increase payload size and latency, which conflicts with the purpose of the `verbose` flag. When `verbose=true`, thread enrichment runs concurrently, so results can appear in completion order rather than chronological order.

## How should I handle `resultSizeEstimate` was added to Gmail thread listing response?

`resultSizeEstimate` was added to the response payload of `GMAIL_LIST_THREADS`. If a user expects this field through Google Super thread listing, verify the toolkit/tool version includes the update.

## When should I use Gmail/Google Super query and label filters to find sent or labeled messages?

Gmail/Google Super tools are wrappers over Google APIs, so use Gmail-style `query` filters or `label_ids` where supported to filter messages, including sent-mail style queries. If the exact filter is not exposed, file a tool request for the endpoint/parameter.

## How should I handle google Super Sheets 404s can mean wrong spreadsheet ID, missing access, or missing spreadsheet scope?

For Google Super Sheets 404s, first verify the spreadsheet ID, confirm the sheet is shared with the connected Google account, and ensure the connection has `https://www.googleapis.com/auth/spreadsheets`. Reconnect after changing scopes or sharing permissions.

## What does `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER` mean?

`GOOGLESUPER_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER` was called out as soon to be deprecated. Use `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER` instead for calendar event sync/change workflows.

## How should I handle google Super cannot schedule Gmail emails out of the box?

Google Super does not support scheduling an email out of the box. Use another email sending toolkit such as `RESEND_SEND_EMAIL` if the user's use case can be met outside Gmail scheduled-send semantics.

## How should I handle missing Google Super endpoints should be filed as tool requests, not toolkit requests?

If Google Super already exists but a specific endpoint is missing, file a tool request with the endpoint/API details. Toolkits are providers/services, while tools are individual endpoints/actions. Enterprise users are prioritized, but general requests are still reviewed.

## How should I handle `Connection initiation did not complete within 10 minutes` means OAuth consent was not completed, not token refresh failure?

If expired connections share status reason `Connection initiation did not complete within 10 minutes`, the OAuth flow was initiated but the user did not complete consent within the 10-minute window. No provider tokens were issued in that case, so it is not a 1-2 week refresh token expiry problem.

## How should I handle google users can deselect scopes during consent; Composio marks active if token exchange succeeds?

Google lets users selectively deselect scopes during consent. Composio marks the connection active as long as token exchange succeeds, even if the final granted scopes are a subset of the auth config's requested scopes. The auth config scopes are the blueprint, but the final permissions are decided by the end user on the consent screen.
