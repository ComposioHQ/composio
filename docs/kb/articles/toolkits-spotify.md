Use this guide to configure Spotify OAuth and scopes, then use Spotify through MCP, custom toolkits, and triggers.

## Configure Spotify OAuth and scopes

**Use a customer-owned OAuth app.** Composio-managed OAuth is not currently available for Spotify. Create a custom auth config with your Spotify client ID and client secret, then have each user complete the Spotify authorization flow.

**Add library scopes before reconnecting.** If Spotify tools need library access, ensure scopes such as `user-library-read` and `user-library-modify` are present in the auth config. After adding scopes, reconnect so the connected account receives the new grants.

**Add playlist-write scopes before reconnecting.** If playlist write actions return Spotify `403 Insufficient client scope`, make sure the auth config requests `playlist-modify-public`, `playlist-modify-private`, or both as appropriate. Add the scopes before reconnecting; reconnecting an unchanged auth config preserves the same missing-scope problem.

This is separate from older playlist endpoint issues. A call can reach the current `/items` endpoint and still fail because its token lacks playlist write permission.

## Use Spotify through MCP, custom toolkits, and triggers

**Avoid names that collide with the built-in toolkit.** If creating a custom Spotify-related toolkit, avoid naming it exactly `Spotify` because a built-in Spotify toolkit already exists. Use a distinct name such as `spotify-custom` to avoid slug or name collision errors.

**Add Spotify from the MCP configs page.** To use Spotify through MCP, create or edit an MCP config from the platform MCP configs page and add Spotify to that server. Then use the generated MCP URL in the MCP client.

**Check the current trigger catalog when an event is missing.** Spotify is listed among trigger-capable toolkits, with three Spotify triggers. If the event you need is missing, submit it through the standard trigger-request flow.
