## How should I handle discord and DiscordBot use different token types?

Discord has two different authorization models: a user token represents an individual Discord user, while a bot token represents a bot account inside Discord. Composio separates these into different toolkits because the credentials and API behavior are different. Use the Discord toolkit for user-authorized actions and DiscordBot when the workflow needs to act as a Discord bot.

## How should I handle DiscordBot 401s on active connections?

When DiscordBot tool calls return 401 on an active connection, first identify whether the auth config uses a bot-token-capable setup and whether the Discord app has the permissions required by the action. For production bots, use the user's own Discord app credentials so they control the bot token, scopes, permissions, and server installation.

## What does Discord message triggers need?

Discord's REST endpoint for channel messages requires a bot token in the Authorization header. OAuth user tokens, even with message-related scopes, do not satisfy that REST API requirement. Use a bot-token-capable Discord connection for bot/channel-message automation. Adding more OAuth user scopes does not turn a Discord user token into a bot token.

## How should I handle verify Discord auth config scopes when bot actions do not respond?

For DiscordBot behavior that does not respond as expected, verify that the Discord auth config includes the necessary scopes and permissions for the action being tested. Discord's OAuth2 documentation should be used as the source for the required scopes. If scopes look correct and the issue persists, collect the connected account ID or log ID for troubleshooting.

## What should I know about Multiple connected accounts for the same app?

For workflows that need separate Discord identities, use distinct users or explicit connected accounts in session-based flows. Do not rely on one app context to implicitly switch between multiple Discord identities.
