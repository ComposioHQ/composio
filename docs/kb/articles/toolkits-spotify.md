Use this guide to configure Spotify OAuth and scopes, then use Spotify through MCP, custom toolkits, and triggers.

## Configure Spotify OAuth and scopes

**Choose managed or customer-owned OAuth.** Use the managed OAuth flow for the standard connection. Configure your own Spotify OAuth app when you need control over scopes, provider app settings, or branding.

**Add library scopes before reconnecting.** If Spotify tools need library access, ensure scopes such as `user-library-read` and `user-library-modify` are present in the auth config. After adding scopes, reconnect so the new scopes are granted on the connected account.

**Add playlist-write scopes before reconnecting.** If playlist write actions return Spotify `403 Insufficient client scope`, make sure the auth config requests `playlist-modify-public`, `playlist-modify-private`, or both as appropriate. Add the scopes before reconnecting; reconnecting an unchanged auth config preserves the same missing-scope problem.

This is separate from older playlist endpoint issues. A call can reach the current `/items` endpoint and still fail because its token lacks playlist write permission.

## Use Spotify through MCP, custom toolkits, and triggers

**Avoid names that collide with the built-in toolkit.** If creating a custom Spotify-related toolkit, avoid naming it exactly `Spotify` because a built-in Spotify toolkit already exists. Use a distinct name such as `spotify-custom` to avoid slug/name collision errors.

**Add Spotify from the MCP configs page.** To use Spotify through MCP, create or edit an MCP config from the platform MCP configs page and add Spotify to that server. Then use the generated MCP URL in the MCP client.

**Check the current trigger catalog when an event is missing.** Spotify is listed among trigger-capable toolkits, with three Spotify triggers. If a needed Spotify trigger is missing, submit the exact event through the Composio request portal.
