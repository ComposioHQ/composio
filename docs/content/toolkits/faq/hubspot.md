## Why do users see a "Connecting an unverified app" warning?

HubSpot shows this warning when the OAuth app being installed has not been approved by HubSpot's ecosystem review process. The OAuth connection can still work, but HubSpot asks the user to explicitly accept the risk before continuing.

For Composio-managed HubSpot auth, this depends on Composio's HubSpot app approval status. If the warning blocks your users, use your own HubSpot OAuth app credentials in a custom Composio auth config.

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

## What should I know about Minimum HubSpot contact scopes?

For HubSpot CRM contacts, the minimum scopes are `crm.objects.contacts.read` and `crm.objects.contacts.write`. Sensitive contact fields require the corresponding sensitive scopes such as `crm.objects.contacts.sensitive.read` and `.write`.

## When should I use Composio scopes API or HubSpot docs to find required HubSpot scopes?

Use HubSpot’s own scopes documentation and Composio’s scopes/tools API to map actions to required scopes. This is better than guessing scopes manually.

## How do I create custom HubSpot tools through toolkit-authenticated API requests?

You can create a custom tool that sends authenticated requests to HubSpot API endpoints; Composio handles authentication for the connected account. Alternatively, call the provider directly with connection config/custom headers if needed.

## What is needed for HubSpot trigger setup?

For HubSpot webhook/trigger setup, get the app ID from HubSpot’s webhook app documentation / developer app settings and use it when configuring triggers.

## When should I use custom HubSpot credentials for white-label auth?

Use your own HubSpot OAuth app credentials/custom auth config. That gives control over branding/consent and avoids relying on the Composio managed app for the user-facing OAuth screen.

## What should I do if HubSpot shows an unverified app warning?

The default managed HubSpot OAuth app is intended to make setup easy for users getting started with Composio. If the warning blocks your users, use your own HubSpot OAuth app credentials in a custom Composio auth config. That lets you control the OAuth app identity and verification posture shown during OAuth.

Use the HubSpot custom OAuth/BYOA guide (`https://composio.dev/auth/hubspot`) and the Composio callback URL shown in the auth config, usually `https://backend.composio.dev/api/v3/toolkits/auth/callback`.

## How should HubSpot scopes match app configuration?

HubSpot requires scopes to be declared in the app configuration before OAuth. The scope set on the Composio auth config should match the HubSpot app settings; HubSpot will not dynamically adjust scopes at connection time.

## HubSpot OAuth token-fetch 400: check client secret and required-scope alignment

First check the HubSpot OAuth client secret. If the secret was rotated or copied from the wrong HubSpot app, HubSpot can fail token exchange with a 400.

Then check scope alignment. HubSpot is strict about required scopes:

- Required scopes configured on the HubSpot app must be present in the OAuth request/install URL `scope` parameter for successful installation.
- If the Composio auth config requests required scopes that do not match your own HubSpot app's configured required scopes, authorization/token exchange can fail.
- Optional scopes should be requested through HubSpot's `optional_scope` parameter. If the selected HubSpot account/user cannot grant an optional scope, HubSpot can omit it and the resulting token will not include that scope. Do not assume optional scopes were granted; inspect token/granted scopes before relying on optional capabilities.

For Composio-managed HubSpot auth configs, do not change the default scope set. If the user needs a different required/optional scope configuration, they need to use their own HubSpot OAuth app through a custom Composio auth config.

## What should I know about HubSpot scopes?

If a required HubSpot scope is not available on the managed OAuth app, use your own HubSpot OAuth app where the scope is configured in HubSpot and requested by the Composio auth config.

## Old HubSpot SDK/toolkit versions use old double-prefixed slugs

Update the SDK and explicitly use the latest HubSpot toolkit version. Older versions used slugs like `HUBSPOT_HUBSPOT_LIST_CONTACTS`; newer versions use slugs like `HUBSPOT_LIST_CONTACTS`.

## HubSpot auth loops can be caused by HubSpot-side workspace/login state

If the HubSpot flow loops while Composio works on its side, retry while logged into the correct HubSpot workspace and confirm the OAuth app is public/configured correctly.

## Composio does not provide HubSpot field-level permissions; restrict by user/session/tools instead

Composio does not provide HubSpot field-level permissions inside a single tool call. Approximate this with user-scoped sessions, deciding which users connect HubSpot, and filtering allowed toolkits/tools per session, such as read-only tools for some users and update tools for others.

## HubSpot marketing campaign objects do not expose a properties API like CRM objects

For HubSpot marketing objects such as campaigns, HubSpot does not expose a properties API in the same way it does for CRM objects. Users may need to inspect/configure these from the HubSpot portal.

## HubSpot triggers require each user’s own app ID and developer API key

HubSpot webhook APIs need the specific HubSpot app that should receive webhook notifications. For user HubSpot triggers, `app_id` and developer API key are required because each user needs their own HubSpot app for webhook delivery.

## HubSpot trigger configuration changes

After HubSpot trigger configuration changes, old trigger instances may need to be deleted and recreated so they pick up the new behavior/configuration.

## Deleting a HubSpot connected account disconnects it and stops token refresh

Deleting the connected account disconnects the HubSpot account from Composio and stops refreshing that access token.
