## How should I handle auth Support?

LaunchDarkly in Composio currently uses a LaunchDarkly REST API access token.

- The LaunchDarkly toolkit has one auth scheme: `API_KEY`.
- The connection field is shown as `API Access Token`.
- Requests send the token in the `Authorization` header.

LaunchDarkly in Composio currently connects with a LaunchDarkly REST API access token, not OAuth. LaunchDarkly does expose OAuth2 endpoints for custom and partner integrations, but Composio does not currently expose OAuth as the LaunchDarkly connection method.

## What should I know about OAuth Client Actions?

The LaunchDarkly toolkit includes actions such as `Create OAuth 2.0 Client`. These call LaunchDarkly endpoints like `POST /oauth/clients` after the toolkit is already authenticated with an API access token.

Use this distinction when replying to users:

- The action can create or manage a LaunchDarkly OAuth client inside LaunchDarkly.
- It does not let a Composio user connect their LaunchDarkly account to Composio through OAuth.
- It does not prove that OAuth access tokens can be used against the rest of the LaunchDarkly REST API action surface.

## How should I handle feasibility Notes?

LaunchDarkly exposes OAuth Authorization Server metadata at:

https://app.launchdarkly.com/.well-known/oauth-authorization-server

Observed metadata includes:

- Authorization endpoint: `https://app.launchdarkly.com/trust/oauth/authorize`
- Token endpoint: `https://app.launchdarkly.com/trust/oauth/token`
- Dynamic registration endpoint: `https://app.launchdarkly.com/trust/oauth/register/dcr`
- Revocation endpoint: `https://app.launchdarkly.com/trust/oauth/revoke`
- Response types: `code`
- Grant types: `authorization_code`, `refresh_token`, `client_credentials`
- Token endpoint auth methods: `client_secret_basic`, `client_secret_post`, `none`
- PKCE method: `S256`
- Scopes: `reader`, `writer`, `observability`, `offline_access`

`https://app.launchdarkly.com/.well-known/openid-configuration` returns 404, so treat this as OAuth2, not OIDC.

Composio infrastructure can support this OAuth2 shape, but do not promise user-facing LaunchDarkly OAuth support until an OAuth access token has been tested against the REST API endpoints Composio tools call. LaunchDarkly's public REST API documentation says REST API resources authenticate with personal or service access tokens, or session cookies. LaunchDarkly's OAuth-client-registration docs also say unverified OAuth clients only provide identity verification to members of the same LaunchDarkly organization; users outside that organization require a verified partner OAuth client.

Implementation checklist if LaunchDarkly OAuth becomes supported:

- Confirm whether to use static `OAUTH2` or `DCR_OAUTH`.
- Confirm LaunchDarkly authorization URL, token URL, refresh behavior, scopes, and whether PKCE is required.
- Confirm whether Composio can use a verified/partner OAuth client for users outside Composio's own LaunchDarkly organization.
- Decide whether the OAuth scheme is Composio-managed or requires user-provided OAuth client credentials.
- Verify Apollo Tool Router selection behavior when both `OAUTH2` and `API_KEY` are present.
- Test the OAuth access token against representative LaunchDarkly REST API actions, including `GET /api/v2/projects`.
