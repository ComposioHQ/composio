## Use `user_scopes` for Slack user-token permissions

For the Slack toolkit, `scopes` refers to bot-user scopes. If the use case is to operate as the actual Slack user, pass the permissions in `user_scopes` on the auth config credentials. Slack is special because it separates bot scopes from user scopes. For user-token tools, set `credentials.user_scopes`; the bot `scopes` field may not matter if the Slack application has no bot-user tools for that use case.

## Download Slack file content using file ID

Slack file download is supported through `SLACK_DOWNLOAD_SLACK_FILE`. Pass the Slack file ID, which starts with `F` such as `F123ABCDEF0`. The tool returns downloadable file content plus metadata such as name, mimetype, and size. If the file ID is unknown, first call `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` to find file IDs, then pass the selected ID to the download tool.

## Slack `assistant.search.context` requires Agents & AI Apps and Business+

Slack's `assistant.search.context` requires the Slack OAuth app to have the Agents & AI Apps feature enabled, and the Slack workspace must be on Business+ or higher. Verify workspace support by calling `assistant.search.info`; if `is_ai_search_enabled` is `false`, the workspace plan or feature enablement is the blocker. A customer can unblock with their own Slack OAuth app that has Agents & AI Apps enabled, but they still need Business+ on the workspace.

## Use Slack V2 trigger slugs for channel and direct messages

Use the Slack V2 triggers for message events. `SLACK_CHANNEL_MESSAGE_RECEIVED` is intended for channel messages, and `SLACK_DIRECT_MESSAGE_RECEIVED` is intended for DMs. Slack V2 triggers include dedicated endpoints, signature verification, better DM handling, and richer filtering. Older V1 Slack trigger slugs may still work, but V2 is the recommended path for new setups.

## Slack trigger delivery depends on the Slack app event subscription webhook URL

When Slack trigger events stop unexpectedly, check whether the Slack OAuth app's Event Subscriptions `webhook_url` was changed. If the webhook URL or other Slack app event-subscription settings changed, Slack may stop delivering events to Composio even though the trigger instance was previously working.

## Slack short connect links are not the OAuth redirect URI

The short `/api/v3/s/...` URL is not the `redirect_uri` sent to Slack. It is only a shortened link that redirects the browser to Slack's authorization page. The actual Redirect URI is available in the authConfig and must match what is configured in the Slack OAuth app. The static `callbackUrl` / `redirectUri` must be configured consistently on both Composio and the Slack OAuth app, while `redirectUrl` is the per-connection authentication URL used to send the user through the auth flow.

## Slack scheduled-message attachments are not file uploads

The `attachments` field on Slack scheduled messages refers to Slack's legacy secondary/rich-formatting attachments, not uploaded files. Slack's `chat.scheduleMessage` API does not natively upload files. Files must be uploaded separately, for example with `files.upload` / `files.upload.v2`, and then linked or embedded into the scheduled message body so they unfurl when the scheduled message is posted.

## `admin.conversations:write` requires Slack Enterprise

`admin.conversations:write` is an enterprise/admin-level Slack scope. For APIs such as `admin.conversations.delete`, the Slack workspace must be on an Enterprise plan. If you cannot use channel deletion/admin conversation tools, first confirm the Slack workspace plan and whether the app has the required admin scope.
