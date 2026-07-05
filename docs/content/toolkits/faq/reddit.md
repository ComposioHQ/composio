## When should I use Connect MCP for Reddit OAuth callback failures in Claude Code?

For Claude Code Reddit MCP OAuth callback failures on the legacy MCP path, switch the MCP server URL to `https://connect.composio.dev/mcp` and remove the `x-api-key` header. Connect MCP starts the OAuth authorization flow itself, so the client does not need to manage the API key in headers.

## Does Reddit support OAuth 2.0 custom credentials in auth configs?

Reddit uses OAuth 2.0. For more control, create the Reddit auth config with your own Reddit client ID and client secret instead of relying on managed/default credentials. This is the recommended setup for production-style usage because it gives the user control over their Reddit app and credentials.

## What should I know about Reddit app and account policy limits?

Reddit can enforce app, account, subreddit, spam, rate-limit, and policy controls that affect automation. For production usage, use your own Reddit client ID and client secret so you control the Reddit app, redirect settings, and allowed scopes. When a Reddit tool starts failing, check the Reddit app status, granted scopes, subreddit permissions, account restrictions, and automation volume before retrying the same request repeatedly.

## Older Reddit Create Post tool versions may require `flair_id`

If Reddit Create Post fails on version `00000000_00`, check whether the request is missing `flair_id`; that old version requires it. Prefer pinning a specific current toolkit/tool version to avoid breaking changes. In recent Reddit tool versions, `flair_id` is no longer required for the Create Post call.
