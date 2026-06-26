## How do I set up custom OAuth credentials for Pipedrive?

For a step-by-step guide on creating and configuring your own Pipedrive OAuth credentials with Composio, see [How to create OAuth credentials for Pipedrive](https://composio.dev/auth/pipedrive).

## Why am I seeing "App not found" when connecting Pipedrive?

Composio's default Pipedrive OAuth credentials may have expired. Use your own OAuth app credentials until the default is restored.

---

## What should I know about Claude may block Pipedrive because payment-processing toolkits?

If Claude reports `[Session Restriction] Toolkit 'pipedrive' is disabled for this session`, explain that this is intentional behavior caused by Claude's payment-processing policy classification. The workaround is to use Composio through Claude Code or Cowork via the Composio CLI path while direct access is restricted.

## What does Pipedrive OAuth initiation require?

When initiating a Pipedrive OAuth connection, pass the Pipedrive workspace subdomain/domain expected by the auth config. If the user has `voltiqsrl.pipedrive.com`, pass `voltiqsrl` rather than the full hostname.

## Do not install the Pipedrive app directly from Pipedrive OAuth settings?

For Pipedrive custom OAuth, enable the app in Rube/Composio and complete setup there with the user's own developer app credentials. Do not try to install the app directly from Pipedrive's OAuth app settings. During the Composio/Rube flow, provide the Pipedrive subdomain when requested.

## When should I use custom credentials or API key when Composio's default Pipedrive OAuth app is unavailable?

If the default Pipedrive OAuth app is unavailable, advise the user to use their own Pipedrive OAuth credentials or API-key auth. There may not be a reliable ETA while waiting on Pipedrive provider approval or review.

## How should I handle hosted auth links can collect Pipedrive required fields?

Use hosted auth links when you want Composio to collect required provider-specific fields during connection initiation. You can also inspect the auth config/toolkit metadata to see the expected input fields before starting the Pipedrive connection.

## What should I pass for `callback_url` when initiating Pipedrive auth to redirect users after authentication?

When initiating a Pipedrive connection through SDK/API, pass `callback_url` or `callbackUrl` in the connection initiation call. Composio redirects the user to that URL after the provider authentication flow completes.

## How should I handle pipedrive has trigger support?

Pipedrive has trigger support. Check the toolkit page for the currently available trigger list.
