Use this guide to configure Salesforce OAuth and domains, troubleshoot connected-app access, choose current tools, and build UI bridge flows safely.

## Configure Salesforce OAuth and connection flows

**Use customer-owned credentials for app-level control.** The current Salesforce toolkit supports OAuth2 and server-to-server OAuth2 with
customer-owned credentials. Configure the Salesforce connected app according to
Salesforce's OAuth guidance and use its credentials in a custom Composio auth
config. This gives the customer control over scopes, branding, and provider-side
policy.

**Choose hosted auth or direct initiation based on who supplies required fields.** The Salesforce field collection interface is part of Hosted Authentication / the connection link flow. If you want Composio to collect required fields, use hosted auth. If your app already knows the Salesforce instance/subdomain values, skip that interface and call `.initiate()` directly with the required fields. Use `.refresh()` to regenerate the auth URL for an already initiated connection; `.link()` starts a new connection. If you truly need multiple connections for the same `user_id`, pass `allow_multiple=True` to `.initiate()`.

**Match the redirect URI to the current Composio callback.** Use the callback URL shown by the current Composio auth-config flow as the authorized redirect URI for custom Salesforce OAuth. This provider callback is separate from the post-auth customer redirect passed as `callback_url` / `callbackUrl` during connection initiation.

## Set the Salesforce domain and connection fields

**Provide the instance endpoint and My Domain subdomain.** Salesforce accepts additional connection initiation fields. Fetch the toolkit by slug (`/api/v3.1/toolkits/salesforce`) to inspect the expected fields, and fetch the connected account to see the same fields after connection. The important Salesforce fields are `My Domain Subdomain` and `Instance endpoint`. If you are initiating directly through the SDK/API, pass these fields through `.initiate()` rather than waiting for the hosted connection UI.

**Use the My Domain or API prefix when `login` is not enough.** For Salesforce, the default subdomain value is `login`, and that works in most cases. If the default or a simple org label fails, Composio needs the Salesforce login/API domain prefix rather than the full browser URL.

Use these formats:

- Default case: keep `login`.

- Standard My Domain URL: for `https://your-company.my.salesforce.com/...`, pass `your-company.my`.

- Developer Edition / Lightning URL: for `https://<org>.develop.lightning.force.com/...`, the matching OAuth/My Domain host is usually `https://<org>.develop.my.salesforce.com/...`, so pass `<org>.develop.my`.

If the customer enters only `<org>`, Composio may generate `<org>.salesforce.com`, which can fail before OAuth with a browser DNS error such as `DNS_PROBE_FINISHED_NXDOMAIN`.

**Recheck the domain when Salesforce returns `URL_NOT_RESET`.** `URL_NOT_RESET` can happen when the Salesforce org requires a specific My Domain value but the connection is using the generic `login` default or an incomplete subdomain. The default `login` value is fine for most Salesforce flows, but for org-specific failures recheck the Salesforce domain/subdomain values on the connection, pass the correct My Domain subdomain, and retry on the latest toolkit version if the issue was seen on an older pinned version.

## Troubleshoot connected-app access and token policies

**Ask an org admin to install or approve restricted connected apps.** Salesforce connected app usage restrictions can require an org admin to install or approve the connected app before org users can authenticate. Check whether the error URL includes `error=invalid_client&error_description=app+must+be+installed+into+org`. In Salesforce Setup, go to OAuth Connected App Usage and look for the app with an Install button in the Actions column. After the admin installs/enables the app, users should retry authentication.

**Account for Salesforce's five active refresh-token limit.** Salesforce allows only five active refresh tokens per user per connected app. When the same Salesforce user connects a sixth time, Salesforce can revoke the oldest refresh token, which makes older Composio connected accounts fail with token errors. Also check whether the user changed their password, revoked the app, changed connected app refresh-token policy away from `valid until revoked`, or has org-level session policies that invalidate tokens.

## Discover and use current Salesforce tools

**Inspect object schemas before querying or updating them.** Use `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT` when you need to inspect the fields available on a Salesforce object. This is the right tool for schema discovery before building object-specific queries or update flows.

**Replace deprecated retrieve actions with current get and list tools.** Use the current Salesforce tool slugs instead of the deprecated retrieve variants: `SALESFORCE_RETRIEVE_LEAD_BY_ID` -> `SALESFORCE_GET_LEAD`, `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID` -> `SALESFORCE_GET_CONTACT_BY_ID`, and `SALESFORCE_RETRIEVE_OPPORTUNITIES_DATA` -> `SALESFORCE_LIST_OPPORTUNITIES`.

**List contacts before fetching a specific contact by ID.** Use `SALESFORCE_LIST_CONTACTS` to list contacts and capture the IDs with their names. Then call `SALESFORCE_GET_CONTACT_BY_ID` with the desired contact ID to fetch the specific contact details.

## Use Proxy Execute for Salesforce UI bridge flows

Do not build Salesforce Frontdoor/UI bridge flows by reading access tokens from the connected account API. Use Proxy Execute with the Salesforce connected account instead. Composio injects the OAuth access token server-side into the proxied Salesforce request, such as a call to `/services/oauth2/singleaccess`, and Salesforce returns the frontdoor URI that the application can redirect the user's browser to.
