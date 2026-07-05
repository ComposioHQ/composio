## How do I set up custom Google OAuth credentials for Google Sheets?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Sheets?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Sheets API has not been used in project" error?

When using custom OAuth credentials, the Google Sheets API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

---

## What should I know about Google Sheets 429s?

Google Sheets read/write operations are subject to Google's own API limits. When users use Composio's default Google OAuth app, the Google API quota is shared across many users, so high-volume usage can hit rate limits even if the user's Composio plan has capacity. For production/high-volume workflows, use the user's own Google OAuth credentials to get dedicated quota and more control over rate limits. Composio may pursue quota increases, but shared quota can still fall short under heavy load.

## What should I know about Platform Google Sheets connections?

Connections made on the Platform side (`dashboard.composio.dev`) are isolated from the For You / `connect.composio.dev/mcp` flow. A Google Sheets connection created on Platform will not automatically appear in Connect MCP. To use Sheets through Connect MCP, ask the MCP server from the client to connect Google Sheets, complete the surfaced auth link, then retry discovery/execution.

## When do old Google Sheets integrations need a new auth config?

Scopes cannot always be added to an existing Google Sheets integration if the required permissions belong to a newer Google OAuth client/app. Create a new integration/auth config using the newer OAuth app with the required scopes. Existing users can continue on the old integration; only users who need the new action must connect to the new integration and re-authenticate.

## Why does Google Sheets show `This app is blocked`?

Google shows `This app is blocked` when the requested scopes are not verified for the OAuth app being used. With Composio's default Google OAuth app, use the default approved scopes and do not add extra scopes unless they are verified on that app. If the user needs granular or additional sensitive/restricted scopes, they should use their own Google OAuth credentials where those scopes are configured and verified.

## Google Sheets access cannot be restricted at folder level through Composio

Composio does not add folder-level spreadsheet restrictions, and Google's API access model does not support Sheets access scoped to a Drive folder in that way. Access is managed at the account/spreadsheet level through OAuth scopes and file sharing. Use scopes and spreadsheet/account permissions rather than expecting a folder-level Sheets restriction.

## Fetch more than the default 20 Google Sheets tools with `limit`

`get_raw_composio_tools` returns 20 tools by default. Pass a larger `limit` to fetch the full Google Sheets tool set, for example `.get_raw_composio_tools(toolkits=["GOOGLESHEETS"], limit=1000)`.

## Google Sheets MCP may require the spreadsheet ID instead of searching by name

The Google Sheets MCP flow referenced did not support searching through spreadsheets by name. Provide the spreadsheet ID directly in the chat/tool call when asking for operations like getting sheet names.

## When should I use `GOOGLESHEETS_BATCH_UPDATE` or `GOOGLESHEETS_SHEET_FROM_JSON` to add values?

Use `GOOGLESHEETS_BATCH_UPDATE` when updating or adding values to an existing sheet. If the workflow starts from structured JSON and needs to create/populate a sheet, use `GOOGLESHEETS_SHEET_FROM_JSON`.

## Execute Google Sheets tools by passing the exact tool slug

When executing Google Sheets tools, pass the exact slug directly as the tool identifier, for example `composio.tools.execute("GOOGLESHEETS_LIST_TABLES", executePayload)`. If a wrapper parameter like `params.toolIdentifier` is used, verify it resolves to the exact tool slug.

## Why can Google Sheets return 403 on an old toolkit version?

If Google Sheets actions fail with permission errors and logs show an old version such as `00000000_00`, switch to the latest Google Sheets toolkit version, for example `20260324_00`. See the toolkit versioning docs for how to move off a pinned version.

## When should I use Google Super when one Google connection should cover Gmail, Sheets, Docs, Drive, and other Google tools?

Use the `googlesuper` toolkit when the use case needs one Google connection covering multiple Google Workspace tools such as Gmail, Sheets, Docs, Drive, and Calendar. Auth configs are otherwise bound to individual toolkit slugs, so Google Super is the unified toolkit path.

## When should I use full Google scope URLs such as `https://www.googleapis.com/auth/drive`, not shorthand `/drive`?

When configuring Google scopes manually, use the full scope URL. For Drive access, use `https://www.googleapis.com/auth/drive` rather than shorthand values like `/drive`.
