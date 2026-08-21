## Allow the Composio auth-app redirect URL in the Dropbox app

For Dropbox OAuth setup, configure the Dropbox app with the exact callback shown by the current Composio auth-config flow. Do not use the legacy v1 auth-app callback from older examples.

## Dropbox connections use Dropbox native OAuth, not Microsoft/Azure/Outlook login

The Dropbox integration uses Dropbox's native OAuth2 flow, so users authenticate through Dropbox's login page. Composio cannot add Microsoft, Azure, or Outlook as alternative identity providers for Dropbox because the authentication method is controlled by Dropbox's API. If the customer's Dropbox Business tenant has SSO configured with Microsoft/Azure AD, that SSO behavior must be configured in Dropbox, not in Composio.

## For Dropbox upload, `path` is the Dropbox destination and `content` is the local file path

For the Dropbox upload action, `path` is the destination path inside Dropbox,
while `content` is the local file path that should be uploaded. Provide the
local file path in `content`.

## Pass file paths to SDK attachment arguments rather than base64/file metadata objects

When using the SDK attachment argument for supported email tools, pass a file path rather than an object containing filename, data, and content type. The SDK handles the file path. If the source file is available at a Dropbox-backed path, pass that Dropbox file path directly in the attachment argument.

## Use DROPBOX_GET_ABOUT_ME to confirm which Dropbox account is connected

If Dropbox files or folders appear to be missing after a successful operation, confirm the connected Dropbox account before deeper debugging. Use `DROPBOX_GET_ABOUT_ME` to inspect the account tied to the active Composio connection and compare it with the Dropbox account the user is checking manually.
