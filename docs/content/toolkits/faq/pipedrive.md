## How do I set up custom OAuth credentials for Pipedrive?

For a step-by-step guide on creating and configuring your own Pipedrive OAuth credentials with Composio, see [How to create OAuth credentials for Pipedrive](https://composio.dev/auth/pipedrive).

## Why am I seeing "App not found" when connecting Pipedrive?

Pipedrive usually shows "App not found" when the OAuth app used for the connection is not approved or available for that user/workspace.

If you are using managed Pipedrive OAuth, this means the managed OAuth app is still under Pipedrive review/verification. If you are using your own Pipedrive OAuth app, check the app's approval/verification status in Pipedrive and make sure the user is authorizing the same app configured in the auth config. After the app is approved or corrected, start a fresh connection.

## How should I connect with my own Pipedrive OAuth app?

Create the OAuth app in Pipedrive Developer Hub, then use that app's client ID and client secret in a Pipedrive custom OAuth auth config.

Do not start the user connection by clicking **Install and Test** inside Pipedrive's OAuth app settings. That button starts Pipedrive's own test/install flow, not the Composio connection flow, and can send the user to the callback URL without the Composio auth config context.

After saving the custom auth config, start the connection from Composio and enter the Pipedrive subdomain when prompted. If Pipedrive shows "App not found", verify that the client ID and secret match the same Pipedrive OAuth app, that the app is approved/available for the user, and that the redirect URI matches the Pipedrive auth setup guide.
