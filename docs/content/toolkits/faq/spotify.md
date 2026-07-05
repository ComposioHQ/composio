## Why is there no default OAuth app for Spotify?

Composio does not provide a default OAuth app for Spotify. Create your own OAuth app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) to use the Spotify toolkit.

---

## When do Spotify library tools need extra scopes?

If Spotify tools need library access, ensure scopes such as `user-library-read` and `user-library-modify` are present in the auth config. After scopes are added, the user should reconnect so the new scopes are granted on the connected account.

## Spotify playlist tools that fail on older endpoints

If `SPOTIFY_GET_PLAYLIST_ITEMS` or `SPOTIFY_UPDATE_PLAYLIST_ITEMS` fails with 403 or older endpoint behavior, check whether the tool version is using a deprecated Spotify endpoint. Use the latest Spotify toolkit version where possible.

## Custom Spotify toolkit names cannot collide with the built-in Spotify toolkit slug/name

If creating a custom Spotify-related toolkit, avoid naming it exactly `Spotify` because a built-in Spotify toolkit already exists. Use a distinct name such as `spotify-custom` to avoid slug/name collision errors.

## Spotify can be added to an MCP server from the MCP configs page

To use Spotify through MCP, create or edit an MCP config from the platform MCP configs page and add Spotify to that server. Then use the generated MCP URL in the MCP client.

## How should I revoke Spotify tokens?

Spotify may not support provider-side programmatic token revocation through Composio. If automatic revocation is unavailable, remove the app manually from Spotify/provider settings.
