Use this guide to configure Pipedrive authentication, initiate connections, and use Pipedrive triggers.

## Configure Pipedrive authentication

**Choose the authentication mode that fits the deployment.** Use Composio-managed OAuth for the standard connection flow. Use your own Pipedrive OAuth app or API key when you need control over app settings, scopes, branding, or provider policy.

**Pass the workspace subdomain during OAuth initiation.** When initiating a Pipedrive OAuth connection, pass the Pipedrive workspace subdomain/domain expected by the auth config. For example, if the workspace is `your-workspace.pipedrive.com`, pass `your-workspace` rather than the full hostname.

**Complete custom OAuth setup through Composio.** For Pipedrive custom OAuth, enable the app in Composio and complete setup there with the customer's own developer app credentials. Do not try to install the custom app directly from Pipedrive's OAuth app settings. During the Composio connection flow, provide the Pipedrive subdomain when requested.

**Let hosted auth links collect required fields.** Use hosted auth links when you want Composio to collect required provider-specific fields during connection initiation. You can also inspect the auth config/toolkit metadata to see the expected input fields before starting the Pipedrive connection.

## Initiate Pipedrive connections and use triggers

**Pass a callback URL when initiating auth.** When initiating a Pipedrive connection through SDK/API, pass `callback_url` or `callbackUrl` in the connection initiation call. Composio redirects the user to that URL after the provider authentication flow completes.

**Check the current trigger catalog before relying on a count.** Pipedrive has trigger support. Verify the current trigger list in the toolkit catalog before naming an exact count.
