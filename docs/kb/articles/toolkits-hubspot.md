Use this guide to configure HubSpot authentication, troubleshoot OAuth connections, call HubSpot APIs, and set up triggers.

## Configure HubSpot OAuth scopes and branding

**Choose the required contact scopes.** For HubSpot CRM contacts, the minimum scopes are `crm.objects.contacts.read` and `crm.objects.contacts.write`. Sensitive contact fields require the corresponding sensitive scopes such as `crm.objects.contacts.sensitive.read` and `.write`.

**Map tools to scopes before configuring the app.** Use HubSpot's own scopes documentation and Composio's scopes/tools API to map actions to required scopes. This is better than guessing scopes manually.

**Keep the HubSpot app and Composio auth config aligned.** HubSpot requires scopes to be declared in the app configuration before OAuth. The scope set on the Composio auth config should match the HubSpot app settings; HubSpot will not dynamically adjust scopes at connection time.

**Use customer-owned credentials for white-label OAuth.** Use your own HubSpot OAuth app credentials/custom auth config. That gives control over branding/consent and avoids relying on the Composio managed app for the customer-facing OAuth screen.

## Troubleshoot HubSpot OAuth connections

**For a 400 during token exchange, check the client secret first.** Several reported customer-owned HubSpot OAuth failures were resolved by copying the correct current client secret from the HubSpot app and updating the Composio custom auth config to match. If the secret was rotated or copied from the wrong HubSpot app, HubSpot can fail token exchange with a 400.

Then check scope alignment. HubSpot is strict about required scopes:

- Required scopes configured on the HubSpot app must be present in the OAuth request/install URL `scope` parameter for successful installation.
- If the Composio auth config requests required scopes that do not match the customer-owned HubSpot app's configured required scopes, authorization/token exchange can fail.
- Optional scopes should be requested through HubSpot's `optional_scope` parameter. If the selected HubSpot account/user cannot grant an optional scope, HubSpot can omit it and the resulting token will not include that scope. Do not assume optional scopes were granted; inspect token/granted scopes before relying on optional capabilities.

For Composio-managed HubSpot auth configs, do not change the default scope set. If you need a different required/optional scope configuration, use your own HubSpot OAuth app through a custom Composio auth config.

**For an authorization loop, verify HubSpot's workspace and login state.** If the HubSpot flow loops while Composio works on its side, retry while logged into the correct HubSpot workspace and confirm the OAuth app is public/configured correctly.

**To disconnect HubSpot, delete the connected account.** Deleting the connected account disconnects the HubSpot account from Composio and stops refreshing that access token.

## Use HubSpot APIs and current toolkit versions

**Create custom HubSpot tools through authenticated API requests.** You can create a custom tool that sends authenticated requests to HubSpot API endpoints; Composio handles authentication for the connected account. Alternatively, call the provider directly with connection config/custom headers if needed.

**Handle marketing objects separately from CRM properties.** For HubSpot marketing objects such as campaigns, HubSpot does not expose a properties API in the same way it does for CRM objects. You may need to inspect or configure these from the HubSpot portal.

**Upgrade old HubSpot SDK and toolkit versions.** Older versions used slugs like `HUBSPOT_HUBSPOT_LIST_CONTACTS`; newer versions use slugs like `HUBSPOT_LIST_CONTACTS`. Update the SDK and explicitly use the latest HubSpot toolkit version.

## Configure HubSpot triggers for each customer app

HubSpot webhook APIs need the specific HubSpot app that should receive webhook notifications. Get the app ID from HubSpot's webhook app documentation or developer app settings and use it when configuring triggers.

For triggers that use a customer-owned HubSpot app, `app_id` and developer API key are required because each app receives its own webhook delivery.
