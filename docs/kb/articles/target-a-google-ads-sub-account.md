Customer-scoped Google Ads tools accept an optional per-call `customer_id`. Pass the child or sub-account customer ID and it becomes the target account in the Google Ads request path.

## How the account is resolved

- With `customer_id` set, that account is the target.
- With `customer_id` omitted, the tool falls back to the customer ID stored on the connection.
- When the requested customer differs from the connection's customer ID, the connection's ID can supply the MCC or manager context for Google's `login-customer-id` header, unless that header is already present.

## Discovering accounts is a separate step

`GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` returns the accounts the connection can reach, and `GOOGLEADS_LIST_SUB_ACCOUNTS` enumerates children under a manager account. Both are for discovery — customer-scoped tools still need a target customer ID selected explicitly afterwards.

If targeting still resolves to the wrong account, contact support with the tool name, request or log ID, manager customer ID, child customer ID, and the Google error.
