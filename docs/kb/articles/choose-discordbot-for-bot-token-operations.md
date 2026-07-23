Use **DiscordBot** for operations that must act as a bot, and use **Discord** for user-authorized OAuth operations. A bot-token problem is not fixed by adding more OAuth user scopes.

## Pick the toolkit by credential

- Choose Discord when the action uses a user's OAuth bearer token.
- Choose DiscordBot when the action requires a Discord bot token.

For a bot operation that fails, first run the current DiscordBot authentication diagnostic and then check the bot's guild membership, channel permissions, and the selected token. A 401 can indicate an invalid token, while a valid token can still lack access to the target guild or channel.

Trigger availability is schema and version dependent. Do not assume that every message trigger accepts a bot token or that a user-OAuth trigger is unavailable; inspect the current toolkit schema before designing around a trigger.

Review [Composio authentication](/docs/authentication) and Discord's [developer reference](https://docs.discord.com/developers/reference) for the current token and permission model.
