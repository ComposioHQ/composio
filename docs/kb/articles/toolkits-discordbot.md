## Discord and DiscordBot use different token types

Discord has two different authorization models: a user token represents an individual Discord user, while a bot token represents a bot account inside Discord. Composio separates these into different toolkits because the credentials and API behavior are different. Use the Discord toolkit for user-authorized actions and DiscordBot when the workflow needs to act as a Discord bot.

## Verify Discord auth config scopes when bot actions do not respond

For DiscordBot behavior that does not respond as expected, verify that the Discord auth config includes the necessary scopes and permissions for the action being tested. Discord's OAuth2 documentation should be used as the source for the required scopes. If scopes look correct and the issue persists, collect the connected account ID or log ID for debugging.
