## How do I set up custom OAuth credentials for Salesforce?

For a step-by-step guide on creating and configuring your own Salesforce OAuth credentials with Composio, see [How to create OAuth credentials for Salesforce](https://composio.dev/auth/salesforce).

## `URL_NOT_RESET` usually means Salesforce subdomain was not configured and defaulted to `login`

`URL_NOT_RESET` can happen when the Salesforce org requires a specific My Domain value but the connection is using the generic `login` default or an incomplete subdomain. The default `login` value is fine for most Salesforce flows, but for org-specific failures recheck the Salesforce domain/subdomain values on the connection, pass the correct My Domain subdomain, and retry on the latest toolkit version if the issue was seen on an older pinned version.

## Why do I see `OAUTH_APPROVAL_ERROR_GENERIC` or `app must be installed into org` in Salesforce OAuth?

These errors usually mean Salesforce is blocking OAuth because the connected app has not been installed or approved for the org. The user may see `OAUTH_APPROVAL_ERROR_GENERIC`, or the callback URL may include `error=invalid_client&error_description=app+must+be+installed+into+org`.

Ask a Salesforce org admin to approve or install the connected app. In Salesforce Setup, search for **External Client App Settings** or **OAuth Connected App Usage**, find the app, and use the install/approval action shown by Salesforce. After the admin approves the app, the user should retry the OAuth connection.

![Salesforce OAuth approval error showing OAUTH_APPROVAL_ERROR_GENERIC and app must be installed into org.](/images/kb/toolkits/salesforce/salesforce-oauth-approval-error.png)

![Salesforce Setup search showing External Client App Settings for connected app approval.](/images/kb/toolkits/salesforce/salesforce-external-client-app-settings.png)

## Why do I see `invalid_grant` with `ip restricted by app developer`?

Your Salesforce connected app or external client app only accepts requests from trusted IP addresses, and Composio's request came from an address that isn't on the list. New connections fail during OAuth, and existing connections expire when their tokens refresh.

Add all four [Composio outbound IP addresses](/docs/security/outbound-ips) to the app's IP allowlist, including its refresh token IP allowlist if it has one. Add each address as its own range, with the same start and end IP. Alternatively, set the app's IP relaxation policy to relax IP restrictions.

After you update the allowlist, ask affected users to reconnect. Connections that expired don't recover on their own.

## Salesforce allows only five active refresh tokens per user per app

Salesforce allows only five active refresh tokens per user per connected app. When the same Salesforce user connects a sixth time, Salesforce can revoke the oldest refresh token, which makes older Composio connected accounts fail with token errors. Also check whether the user changed their password, revoked the app, changed connected app refresh-token policy away from `valid until revoked`, or has org-level session policies that invalidate tokens.

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

## Why can't I find items I created in Salesforce?

Created records may not appear in a given Salesforce view. Use search to confirm they exist.
