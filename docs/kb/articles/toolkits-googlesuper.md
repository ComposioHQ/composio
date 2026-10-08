Use this guide to configure a Google Super connection and run Google Workspace actions with the required scopes and efficient filters.

## Configure Google Super access and consent

**Use one connection across supported Google Workspace services.** Google Super is a unified/superset toolkit for Google Workspace services. It can cover tools across Gmail, Google Calendar, Google Meet, and related Google APIs through one Google Super connection when the required scopes are configured.

**Remove unneeded scopes and tools carefully.** Google Super can cover all Google services including Gmail, but customers can remove scopes and tools they do not want as part of the Google Super auth/tool configuration. Make sure the remaining scopes still cover the tools the customer expects to use.

**Treat a 10-minute initiation timeout as incomplete consent.** If expired connections share status reason `Connection initiation did not complete within 10 minutes`, the OAuth flow was initiated but the user did not complete consent within the 10-minute window. No provider tokens were issued in that case, so it is not a 1-2 week refresh token expiry problem.

**Account for scopes users deselect during consent.** Google lets users selectively deselect scopes during consent. Composio marks the connection active as long as token exchange succeeds, even if the final granted scopes are a subset of the auth config's requested scopes. The auth config scopes are the blueprint, but the final permissions are decided by the end user on the consent screen.

## Enable service-specific scopes and APIs

**Configure Meet scopes and enable the Google Meet API.** To use Google Meet tools through Google Super, configure `https://www.googleapis.com/auth/meetings.space.created` and `https://www.googleapis.com/auth/meetings.space.settings` in the Google Super auth config, create a new connection for the scope changes to apply, and enable the Google Meet API in Google Cloud Console.

**Include the Gmail settings scope for filter creation.** Google Super uses the same underlying Gmail API requirement for filter creation. See the canonical Gmail guidance: [Creating Gmail filters requires `gmail.settings.basic`](../gmail/public.md#creating-gmail-filters-requires-gmailsettingsbasic).

**Check spreadsheet identity, access, and scope when Sheets returns 404.** For Google Super Sheets 404s, first verify the spreadsheet ID, confirm the sheet is shared with the connected Google account, and ensure the connection has `https://www.googleapis.com/auth/spreadsheets`. If those are all correct and only one tool fails, contact Composio support with the redacted request/response payload and log ID.

## Query Gmail efficiently through Google Super

**Avoid label-detail fan-out when it is unnecessary.** For `GOOGLESUPER_LIST_LABELS`, setting `include_details=true` fans out into one Gmail API call per label. Accounts with many labels can become slow because the calls happen sequentially. Set `include_details=false` or omit the parameter to return to a single API call and much lower latency.

**Use the thread result estimate from current versions.** The current Gmail thread-listing response includes `resultSizeEstimate`. If it is absent through an older pinned Google Super toolkit version, compare its schema with the latest version before changing application logic.

**Filter messages with Gmail queries and label IDs.** Gmail/Google Super tools are wrappers over Google APIs, so use Gmail-style `query` filters or `label_ids` where supported to filter messages, including sent-mail style queries. If the exact filter is not exposed, submit the endpoint or parameter through the Composio request portal.
