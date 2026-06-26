## How do I set up custom OAuth credentials for Dropbox?

For a step-by-step guide on creating and configuring your own Dropbox OAuth credentials with Composio, see [How to create OAuth credentials for Dropbox](https://composio.dev/auth/dropbox).

## When should I use custom Dropbox OAuth credentials for production instead of the default test app?

Composio's default Dropbox OAuth credentials are intended for testing, not production-scale user onboarding. If users hit a Dropbox app user-limit error or need a production launch path, they should create their own Dropbox OAuth2 app credentials, configure a new Composio integration/auth config with those credentials, and have users connect through that integration. Dropbox approval or user-limit changes are controlled by Dropbox and may not have a reliable ETA.

## How should I handle recreate older Dropbox integrations after Composio updates the default OAuth credentials?

If an older Dropbox integration/auth config keeps failing after Dropbox default credentials were updated, create a new Dropbox integration and reconnect accounts to it. Existing integrations may continue using the older OAuth app credentials, including old user-limit behavior, while newly created integrations pick up the updated credentials.

## How should I handle allow the Composio auth-app redirect URL in the Dropbox app?

For Dropbox OAuth setup, make sure the Dropbox app allows the Composio auth-app redirect URL `https://backend.composio.dev/api/v1/auth-apps/add`. Initiating the connection may happen through a connected-accounts endpoint, but the redirect URL Dropbox must allow is the auth-app callback URL used by Composio.

## How should I handle initiate Dropbox OAuth connections with entityId, authMode, integrationId, and redirectUri?

When initiating a Dropbox OAuth connection through the SDK, pass `entityId`, `authMode: "OAUTH2"`, `integrationId`, and `redirectUri` to `toolset.connectedAccounts.initiate`. Also confirm that the ID used is the integration ID from Dashboard > Apps > the app > Integrations.

## What should I know about Dropbox triggers?

Composio does not currently have Dropbox triggers. Custom triggers are not generally supported yet; if a user needs a specific Dropbox trigger use case, collect the use case and escalate it for integrations/product review.

## How should I handle dropbox connections use Dropbox native OAuth, not Microsoft/Azure/Outlook login?

The Dropbox integration uses Dropbox's native OAuth2 flow, so users authenticate through Dropbox's login page. Composio cannot add Microsoft, Azure, or Outlook as alternative identity providers for Dropbox because the authentication method is controlled by Dropbox's API. If the user's Dropbox Business tenant has SSO configured with Microsoft/Azure AD, that SSO behavior must be configured in Dropbox, not in Composio.

## What does For Dropbox upload, `path` mean?

For the Dropbox upload action, `path` is the destination path inside Dropbox, while `content` is the local file path that should be uploaded. Provide the local file path in `content`; the naming was acknowledged as confusing.

## What should I pass for file paths to SDK attachment arguments rather than base64/file metadata objects?

When using the SDK attachment argument for supported email tools, pass a file path rather than an object containing filename, data, and content type. The SDK handles the file path. If the source file is available at a Dropbox-backed path, pass that Dropbox file path directly in the attachment argument.

## When should I use DROPBOX_GET_ABOUT_ME to confirm which Dropbox account is connected?

If Dropbox files or folders appear to be missing after a successful operation, confirm the connected Dropbox account before further investigation. Use `DROPBOX_GET_ABOUT_ME` to inspect the account tied to the active Composio connection and compare it with the Dropbox account the user is checking manually.
