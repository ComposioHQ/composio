## How do I connect Telegram with a bot token?

Telegram doesn't support OAuth. Composio connects to a Telegram bot using the bot token from BotFather. The connection acts as the bot, not your personal Telegram account.

### Create the Telegram bot

1. In Telegram, start a chat with [@BotFather](https://t.me/BotFather) and send `/newbot`.

   ![Telegram search results for @BotFather](/images/toolkits/telegram/botfather-search.webp)
2. Enter a display name for the bot, then a username that ends in `bot`, for example `composio_test_bot`.

   ![BotFather chat after /newbot asking for the bot name and username](/images/toolkits/telegram/newbot.webp)
3. Copy the bot token BotFather returns. It looks like `123456:ABC-DEF1234ghIkl`. For an existing bot, send `/token` to BotFather to get it.

   ![BotFather confirmation message with the bot token redacted](/images/toolkits/telegram/bot-token.webp)

The token gives full control of the bot, so store it securely.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Telegram**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Composio toolkit picker with Telegram and its API_KEY badge](/images/toolkits/telegram/select-toolkit.webp)
2. Keep the authentication type as **API Key** and click **Create Auth Config**.

   ![Telegram auth config form with API KEY as the authentication method](/images/toolkits/telegram/api-key-auth-method.webp)
3. Click **Connect Account**, paste the bot token, and confirm the account shows as **Active**.

   ![Composio connect screen with the Bot Token field, value redacted](/images/toolkits/telegram/connect-bot-token.webp)

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Permissions

Telegram bots don't use scopes. What the bot can do depends on which chats, groups, and channels you add it to, and on the admin rights you give it there.
