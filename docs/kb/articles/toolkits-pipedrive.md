Use this guide to configure Pipedrive authentication, initiate connections, and use Pipedrive triggers.

## Configure Pipedrive authentication

**Use custom OAuth or API-key credentials.** Composio-managed OAuth is not currently available for Pipedrive. Create a custom auth config with your Pipedrive OAuth app, or use API-key authentication when that better fits your security requirements.

**Pass the workspace subdomain during OAuth initiation.** When initiating a Pipedrive OAuth connection, pass the Pipedrive workspace subdomain or domain expected by the auth config. For example, if the workspace is `your-workspace.pipedrive.com`, pass `your-workspace` rather than the full hostname.

**Complete custom OAuth setup through Composio.** Enable the app in Composio and complete setup there with your developer app credentials. Do not try to install the custom app directly from Pipedrive's OAuth app settings. During the Composio connection flow, provide the Pipedrive subdomain when requested.

**Let hosted auth links collect required fields.** Use hosted auth links when you want Composio to collect required provider-specific fields during connection initiation. You can also inspect the auth config or toolkit metadata to see the expected input fields before starting the connection.

## Initiate Pipedrive connections and use triggers

**Pass a callback URL when initiating auth.** When initiating a Pipedrive connection through SDK or API, pass `callback_url` or `callbackUrl` in the connection initiation call. Composio redirects the user to that URL after the provider authentication flow completes.

**Check the current trigger catalog before relying on a count.** Pipedrive has trigger support. Verify the current trigger list in the toolkit catalog before naming an exact count.
