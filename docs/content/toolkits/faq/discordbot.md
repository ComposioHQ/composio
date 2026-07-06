## Why can DiscordBot return 401 on the default app?

DiscordBot tool calls can return `401 {"message":"401: Unauthorized","code":0}` even when the connected account is active if the connection uses the default DiscordBot app.

The default app currently has a managed bot-token issue: Discord is rejecting the shared bot token behind that app, so the connection flow can complete while bot API calls still fail. Use your own Discord app credentials in a custom DiscordBot auth config for now. Reconnect through that custom config before retrying the DiscordBot tool call.
