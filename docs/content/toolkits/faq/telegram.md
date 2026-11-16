## How do I connect Telegram with a bot token?

Telegram doesn't support OAuth. Composio connects to a Telegram bot using the bot token from BotFather. The connection acts as the bot, not your personal Telegram account.

### Create the Telegram bot

1. In Telegram, start a chat with [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Enter a display name for the bot, then a username that ends in `bot`, for example `composio_test_bot`.
3. Copy the bot token BotFather returns. It looks like `123456:ABC-DEF1234ghIkl`. For an existing bot, send `/token` to BotFather to get it.

The token gives full control of the bot, so store it securely.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Telegram**.
2. Keep the authentication type as **API Key** and click **Create Auth Config**.
3. Click **Connect Account**, paste the bot token, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Permissions

Telegram bots don't use scopes. What the bot can do depends on which chats, groups, and channels you add it to, and on the admin rights you give it there.
