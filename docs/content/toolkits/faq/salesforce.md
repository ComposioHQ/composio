## How do I set up custom OAuth credentials for Salesforce?

For a step-by-step guide on creating and configuring your own Salesforce OAuth credentials with Composio, see [How to create OAuth credentials for Salesforce](https://composio.dev/auth/salesforce).

## Why can't I find items I created in Salesforce?

Created records may not appear in a given Salesforce view. Use search to confirm they exist.

## How do I query relationships like Pricebooks and Opportunities?

Use SOQL subqueries to traverse relationships. For example, Products → Pricebooks → Opportunities:

```sql
SELECT Id, Name,
  (SELECT Id, Quantity, UnitPrice, TotalPrice, PricebookEntry.Product2.Name FROM OpportunityLineItems)
FROM Opportunity
```

## What fields are required when connecting Salesforce?

You need your subdomain (e.g., `your-company.my`) and instance endpoint `/services/data/v61.0`. If you see `URL_NOT_RESET`, replace the `login` subdomain with your organization's subdomain.

## What happens to deprecated Salesforce tools?

Deprecated tools continue to work until removed. Check tool descriptions for "DEPRECATED:" markers.

---

## What does Salesforce require?

Salesforce is one of the OAuth toolkits where users should bring their own developer credentials rather than relying on Composio-managed OAuth. Create a Salesforce connected app/developer app, configure it according to the Salesforce auth guide, and use those credentials in the Composio authConfig.

## What does Salesforce connection initiation need?

Salesforce accepts additional connection initiation fields. Fetch the toolkit by slug (`/api/v3.1/toolkits/salesforce`) to inspect the expected fields, and fetch the connected account to see the same fields after connection. The important Salesforce fields are `My Domain Subdomain` and `Instance endpoint`. If you are initiating directly through the SDK/API, pass these fields through `.initiate()` rather than waiting for the hosted connection UI.

## How should I handle salesforce subdomain defaults to `login`; use the My Domain/API prefix when needed?

For Salesforce, the default subdomain value is `login`, and that works in most cases. If the default or a simple org label fails, Composio needs the Salesforce login/API domain prefix rather than the full browser URL.

Use these formats:

- Default case: keep `login`.
- Standard My Domain URL: for `https://your-company.my.salesforce.com/...`, pass `your-company.my`.
- Developer Edition / Lightning URL: for `https://<org>.develop.lightning.force.com/...`, the matching OAuth/My Domain host is usually `https://<org>.develop.my.salesforce.com/...`, so pass `<org>.develop.my`.

If the user enters only `<org>`, Composio may generate `<org>.salesforce.com`, which can fail before OAuth with a browser DNS error such as `DNS_PROBE_FINISHED_NXDOMAIN`.

## How should I handle `URL_NOT_RESET` usually means Salesforce subdomain was not configured and defaulted to `login`?

`URL_NOT_RESET` can happen when the Salesforce org requires a specific My Domain value but the connection is using the generic `login` default or an incomplete subdomain. The default `login` value is fine for most Salesforce flows, but for org-specific failures recheck the Salesforce domain/subdomain values on the connection, pass the correct My Domain subdomain, and retry on the latest toolkit version if the issue was seen on an older pinned version.

## When should I use hosted auth for Salesforce required fields, or direct `.initiate()` when you want to prefill them yourself?

The Salesforce field collection interface is part of Hosted Authentication / the connection link flow. If you want Composio to collect required fields, use hosted auth. If your app already knows the Salesforce instance/subdomain values, skip that interface and call `.initiate()` directly with the required fields. Use `.refresh()` to regenerate the auth URL for an already initiated connection; `.link()` starts a new connection. If you truly need multiple connections for the same `user_id`, pass `allow_multiple=True` to `.initiate()`.

## When should I use `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT` to inspect a Salesforce object's fields?

Use `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT` when you need to inspect the fields available on a Salesforce object. This is the right tool for schema discovery before building object-specific queries or update flows.

## What does Salesforce org admins may need?

Salesforce connected app usage restrictions can require an org admin to install or approve the connected app before org users can authenticate. Check whether the error URL includes `error=invalid_client&error_description=app+must+be+installed+into+org`. In Salesforce Setup, go to OAuth Connected App Usage and look for the app with an Install button in the Actions column. After the admin installs/enables the app, users should retry authentication.

## How should I handle salesforce allows only five active refresh tokens per user per app?

Salesforce allows only five active refresh tokens per user per connected app. When the same Salesforce user connects a sixth time, Salesforce can revoke the oldest refresh token, which makes older Composio connected accounts fail with token errors. Also check whether the user changed their password, revoked the app, changed connected app refresh-token policy away from `valid until revoked`, or has org-level session policies that invalidate tokens.

## What does Salesforce action-to-scope mapping mean?

Composio does not maintain a precise granular scope map for every Salesforce action because Salesforce implementations vary heavily by org and many actions rely on SOQL rather than resource-specific endpoints. Users can use Salesforce's granular OAuth scopes instead of `full`, but should explicitly include the `refresh_token` scope so Composio can refresh the connection. If the exact tool set is known, compare those actions against Salesforce's documented OAuth scopes before requesting broad access.

## How should I handle migrate deprecated Salesforce retrieve tools to the newer get/list tools?

Use the newer Salesforce tool slugs instead of the deprecated retrieve variants: `SALESFORCE_RETRIEVE_LEAD_BY_ID` -> `SALESFORCE_GET_LEAD`, `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID` -> `SALESFORCE_GET_CONTACT`, and `SALESFORCE_RETRIEVE_OPPORTUNITIES_DATA` -> `SALESFORCE_LIST_OPPORTUNITIES`.

## How should I handle retrieve a specific Salesforce contact by first listing contacts and then fetching by ID?

Use `SALESFORCE_RETRIEVE_CONTACT_INFO_WITH_STANDARD_RESPONSES` to list contacts and capture the IDs with their names. Then call `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID` with the desired contact ID to fetch the specific contact details. If using newer tool versions, prefer the replacement contact-get tool where available.

## What does The Salesforce custom auth redirect URL mean?

Use Composio's toolkit auth callback URL as the authorized redirect URI for custom Salesforce OAuth configuration: `https://backend.composio.dev/api/v3/toolkits/auth/callback`. For SDK-direct flows, the post-auth user redirect can separately be passed as `callback_url` / `callbackUrl` during connection initiation.
