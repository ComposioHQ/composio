## How does LaunchDarkly authenticate in Composio?

LaunchDarkly in Composio uses a LaunchDarkly REST API access token.

- The LaunchDarkly toolkit has one auth scheme: `API_KEY`.
- The connection field is shown as `API Access Token`.
- Requests send the token in the `Authorization` header.

LaunchDarkly in Composio connects with a LaunchDarkly REST API access token, not OAuth. LaunchDarkly exposes OAuth2 endpoints for custom and partner integrations, but Composio does not expose OAuth as the LaunchDarkly connection method.

## What should I know about OAuth Client Actions?

The LaunchDarkly toolkit includes actions such as `Create OAuth 2.0 Client`. These call LaunchDarkly endpoints like `POST /oauth/clients` after the toolkit is already authenticated with an API access token.

Use this distinction when replying to users:

- The action can create or manage a LaunchDarkly OAuth client inside LaunchDarkly.
- It does not let a Composio user connect their LaunchDarkly account to Composio through OAuth.
- It does not prove that OAuth access tokens can be used against the rest of the LaunchDarkly REST API action surface.
