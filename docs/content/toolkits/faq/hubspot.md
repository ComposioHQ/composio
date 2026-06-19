## Why do users see a "Connecting an unverified app" warning?

HubSpot shows this warning when the OAuth app being installed has not been approved by HubSpot's ecosystem review process. The OAuth connection can still work, but HubSpot asks the user to explicitly accept the risk before continuing.

For Composio-managed HubSpot auth, this depends on Composio's HubSpot app approval status. We are actively working through HubSpot's approval process and expect this to be resolved in the near future. Once the Composio HubSpot app is approved by HubSpot, this warning should stop appearing for new installs that use the approved app.

For custom auth, the warning depends on your own HubSpot developer app. If your users see this warning with custom credentials, submit your HubSpot app for the relevant HubSpot approval or listing flow.

## Should I use Composio-managed auth or my own HubSpot OAuth app?

Use Composio-managed auth when you want the fastest setup and the default Composio HubSpot app covers the permissions you need.

With Composio-managed HubSpot auth, you can only remove optional scopes that are already available on the Composio-managed HubSpot app.

You cannot add new scopes to the managed app, and you cannot remove scopes that are non-optional for that managed auth config. If you need a different scope set, create a custom HubSpot OAuth app and configure those scopes there.

Use your own HubSpot OAuth app when you need a different scope set, your own app name and branding on the consent screen, tighter control over app review and rollout, or a production setup owned by your team. For setup steps, see [How to create OAuth credentials for HubSpot](https://composio.dev/auth/hubspot).

## How do HubSpot scopes work in Composio?

The scope category must match between Composio and your HubSpot developer app.

- Scopes in Composio `scopes` must be configured in HubSpot as **Required** or **Conditionally required**.
- Scopes in Composio `optional_scopes` must be configured in HubSpot as **Optional**.
- Do not request a scope from Composio unless that same scope is enabled in the HubSpot developer app.

If you use the API, pass the fields in the auth config credentials:

```json
{
  "credentials": {
    "scopes": "oauth crm.objects.contacts.read",
    "optional_scopes": "crm.objects.companies.read crm.objects.deals.read"
  }
}
```

Use the [Create Auth Config API](/reference/api-reference/auth-configs/postAuthConfigs) to create the auth config, the [Get Auth Config API](/reference/api-reference/auth-configs/getAuthConfigsByNanoid) to inspect what Composio will request, and the [Update Auth Config API](/reference/api-reference/auth-configs/patchAuthConfigsByNanoid) to change the scope fields.

When reading an auth config through the API, check both `credentials.scopes` and `credentials.optional_scopes`. Together, they represent the HubSpot permissions Composio can request for that auth config.

HubSpot's docs may refer to the authorization URL parameter as `optional_scope`; in Composio, the editable auth config field is named `optional_scopes`.

## What is the recommended custom HubSpot OAuth scope setup?

For custom auth, we usually recommend keeping the required list minimal:

```text
oauth
```

Then put tool-specific HubSpot permissions in `optional_scopes`, and mark those same permissions as optional in your HubSpot developer app.

The main reason is flexibility. HubSpot requires the scopes in the OAuth URL to match how those scopes are categorized in the HubSpot developer app. If you add a new permission as required in HubSpot, every Composio auth config that uses that app must also request it through `scopes`; otherwise new installs can fail. Keeping tool-specific permissions optional makes it easier to add permissions over time without forcing every auth config to move in lockstep.

If a permission is mandatory for your product to work, keep it required. Just make sure it is required in HubSpot and sent through Composio `scopes`.

Example A: all selected permissions are required in HubSpot:

```json
{
  "credentials": {
    "scopes": "oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read",
    "optional_scopes": ""
  }
}
```

Example B: only `oauth` is required in HubSpot and the selected tool permissions are optional:

```json
{
  "credentials": {
    "scopes": "oauth",
    "optional_scopes": "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write tickets timeline"
  }
}
```

Both are valid. What matters is that Composio and HubSpot agree on which scopes are required and which scopes are optional.

After changing scopes, reconnect affected HubSpot accounts. Existing connected accounts keep the scopes granted during the original authorization. Optional scopes can let a connection succeed even when a portal cannot grant every permission, but a tool can still fail later if that tool needs a permission the user did not grant.

## What are common HubSpot troubleshooting checks?

- **Scope mismatch or callback errors:** confirm every requested scope is enabled in HubSpot and is in the same category in both HubSpot and Composio.
- **Missing-scope tool errors:** add the missing scope to the auth config and HubSpot developer app, then reconnect the account.
- **Contact list/search limit errors:** `HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA` and `HUBSPOT_LIST_CONTACTS_PAGE` support a maximum `limit` of 100 results per request.
- **Webhook setup errors:** HubSpot webhooks require a public app with an App ID and Developer API Key. Private or internal apps cannot receive webhooks.
- **Refresh or expiry errors:** Common causes include the user revoking the app in HubSpot, HubSpot app credentials changing, the refresh token being invalidated, or the connected account being reauthorized with a different app configuration. After rotating custom OAuth credentials or changing the HubSpot developer app, reconnect affected HubSpot accounts.

---
