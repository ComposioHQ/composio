Use this guide to choose the correct Slack token model, configure Slackbot scopes and triggers, and send or download Slack content.

## Choose Slack or Slackbot and configure authentication

**Match the toolkit to the token model.** Slack and Slackbot serve different token models. The Slack toolkit performs actions on behalf of an actual Slack user. The Slackbot toolkit performs actions as a bot and should be used for bot scopes such as `channels:join` or bot-token workflows. For mixed use cases, create separate Slack and Slackbot auth configs rather than combining user and bot scopes in one connection.

**Include the verification token for custom Slackbot triggers.** For Slackbot triggers with custom auth, configure the Slack app verification token in the auth config, then create a fresh connection after updating the auth config. The current auth schema does not expose a separate subscription-ID field, so do not substitute one for the verification token.

**Add history scopes for private channels and DMs.** Slack private-channel and DM access requires additional scopes. Use `groups:history` for private channels, `im:history` for direct messages, and `mpim:history` for multi-person DMs. These scopes are not always included by default and may be limited by Slack plan/provider constraints, so the customer may need a custom Slack app with the relevant scopes.

**Do not use a short auth link as the OAuth redirect URI.** The short `/api/v3/s/...` auth link is only a shortened connection initiation URL that redirects the browser to Slack. It is not the `redirect_uri` sent to Slack. Configure the static redirect/callback URI shown in the Composio auth config in the Slack OAuth app; either supported v1 or v3 callback URI can be used depending on the auth config.

## Run Slackbot actions and handle trigger events

**Resolve the Slack file ID before downloading content.** Slack file content can be downloaded with `SLACK_DOWNLOAD_SLACK_FILE`. The tool needs the Slack file ID, usually starting with `F`. If the customer does not have the file ID yet, use `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` first and pass the returned file ID to the download tool.

**Choose one visible content mode when sending a bot message.** Use `SLACKBOT_SEND_MESSAGE` to post to a channel, direct message, or private group. Provide exactly one visible content mode: `markdown_text` for normal Markdown content, or `blocks` for a raw Block Kit layout. Use `fallback_text` only with `blocks`.

**Use trigger identifiers to map events back to connections.** Slackbot trigger payloads include identifiers such as `connection_id` and `trigger_id` inside the payload data. Use `connection_id` to map the event back to the connected account involved in the trigger.
