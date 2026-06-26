## How should I handle DiscordBot 401s on active connections?

When DiscordBot tool calls return 401 on an active connection, first identify whether the auth config uses a bot-token-capable setup and whether the Discord app has the permissions required by the action. For production bots, use the user's own Discord app credentials so they control the bot token, scopes, permissions, and server installation.

## How should I handle discord OAuth credentials do not have a fixed expiration period?

Discord OAuth2 credentials do not have a fixed expiration period. If credentials suddenly fail, they may have been manually revoked, reset, or regenerated in Discord. The user should refresh or create new Discord OAuth credentials and retry. Testing with Composio's default OAuth app can help determine whether the issue is specific to the user's Discord OAuth app/account or broader provider behavior.

## How should I handle multiple Discord identities?

For workflows that need separate Discord identities, use distinct users or explicit connected accounts in session-based flows. Do not rely on one app context to implicitly switch between multiple Discord identities.
