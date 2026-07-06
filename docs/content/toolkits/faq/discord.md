## Discord OAuth credentials do not have a fixed expiration period

Discord OAuth2 credentials do not have a fixed expiration period. If credentials suddenly fail, they may have been manually revoked, reset, or regenerated in Discord. The user should refresh or create new Discord OAuth credentials and retry. Testing with Composio's default OAuth app can help determine whether the issue is specific to the user's Discord OAuth app or account setup.

## Multiple Discord identities

For workflows that need separate Discord identities, use distinct users or explicit connected accounts in session-based flows. Do not rely on one app context to implicitly switch between multiple Discord identities.
