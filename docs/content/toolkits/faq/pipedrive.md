## How do I set up custom OAuth credentials for Pipedrive?

For a step-by-step guide on creating and configuring your own Pipedrive OAuth credentials with Composio, see [How to create OAuth credentials for Pipedrive](https://composio.dev/auth/pipedrive).

## Why am I seeing "App not found" when connecting Pipedrive?

If Pipedrive OAuth shows "App not found", use your own Pipedrive OAuth app credentials or API-key auth and start a fresh connection.

---

## Why can Claude block Pipedrive in some sessions?

If Claude reports `[Session Restriction] Toolkit 'pipedrive' is disabled for this session`, use Composio through Claude Code or Cowork via the Composio CLI path while direct access is restricted.

## What is required for Pipedrive OAuth initiation?

When initiating a Pipedrive OAuth connection, pass the Pipedrive workspace subdomain/domain expected by the auth config. If the account URL is `your-company.pipedrive.com`, pass `your-company` rather than the full hostname.

## Do not install the Pipedrive app directly from Pipedrive OAuth settings?

For Pipedrive custom OAuth, enable the app in Composio and complete setup there with the user's own developer app credentials. Do not try to install the app directly from Pipedrive's OAuth app settings. During the Composio flow, provide the Pipedrive subdomain when requested.

## When should I use custom credentials or API key for Pipedrive?

Use the user's own Pipedrive OAuth credentials or API-key auth when they need control over app approval, scopes, branding, or production availability.

## How should I handle hosted auth links can collect Pipedrive required fields?

Use hosted auth links when you want Composio to collect required provider-specific fields during connection initiation. You can also inspect the auth config/toolkit metadata to see the expected input fields before starting the Pipedrive connection.

## What should I pass for `callback_url` when initiating Pipedrive auth to redirect users after authentication?

When initiating a Pipedrive connection through SDK/API, pass `callback_url` or `callbackUrl` in the connection initiation call. Composio redirects the user to that URL after the provider authentication flow completes.

## How should I handle pipedrive has trigger support?

Pipedrive has trigger support. Check the toolkit page for the currently available trigger list.
