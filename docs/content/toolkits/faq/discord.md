## How should I handle discordBot 401s on managed OAuth were a known managed-app configuration issue?

DiscordBot 401s on Composio-managed auth have been a known issue tied to the managed DiscordBot OAuth app/configuration. When users hit this, first ask whether they are using Composio-managed OAuth or custom credentials. If they are on managed auth, recommend trying their own Discord credentials / custom auth config as a workaround while Composio's managed Discord app verification/configuration is being fixed.

## How should I handle discord OAuth credentials do not have a fixed expiration period?

Discord OAuth2 credentials do not have a fixed expiration period. If credentials suddenly fail, they may have been manually revoked, reset, or regenerated in Discord. The user should refresh or create new Discord OAuth credentials and retry. Testing with Composio's default OAuth app can help determine whether the issue is specific to the user's Discord OAuth app/account or broader provider behavior.

## How should I handle multiple accounts for the same Discord app were not supported in that flow?

Composio did not support connecting multiple accounts for the same app. The capability was not currently available in that flow. As a workaround, users could use Composio MCP offerings or authenticated tool flows depending on the use case, but same-app multi-account support was not available in that specific DiscordBot setup.
