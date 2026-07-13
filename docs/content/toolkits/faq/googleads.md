## Google Ads developer token now belongs on the auth config, not connection initiation

Google Ads was changed so the developer token lives on the auth config itself, not on each connection initiation request. Older auth configs created before this change do not have the developer token field, and new connections through those auth configs can fail because the token is no longer accepted at the connection level. Create a new Google Ads authConfig with the developer token included, then create a fresh connection through that authConfig.

![Google Ads auth config form showing the developer token field under custom developer credentials.](/images/kb/toolkits/googleads/google-ads-developer-token-auth-config.png)

## What can cause Google Ads 429s?

A Google Ads 429 / `RESOURCE_EXHAUSTED` is an upstream Google Ads API limit, not a Composio billing-plan or tool-call quota. Google Ads enforces limits on the underlying developer token, account, request pattern, service, and resource usage.

This can happen with Composio-managed credentials or with custom Google Ads credentials. Reduce request volume, add backoff, simplify expensive queries, and use an owned Google Ads OAuth app/developer token for production isolation where possible.

## Google Ads MCC/sub-account targeting

For Google Ads manager-account (MCC) setups, `GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` can succeed while GAQL/reporting or campaign calls against a child account fail. Two common Google errors are:

- 403 `USER_PERMISSION_DENIED` with guidance that, when accessing a client customer, the manager customer ID must be set in the `login-customer-id` header.
- `REQUESTED_METRICS_FOR_MANAGER` when metric fields are queried directly from the MCC manager account instead of a child/customer account.

Treat this as MCC targeting/account-context, not OAuth. Reconnecting alone does not fix it unless the user had connected the wrong account context.

Correct call shape:

- target child/customer account ID in the request path, for example `/customers/{child_customer_id}/googleAds:searchStream`
- manager/MCC customer ID in the `login-customer-id` header

## Google Ads OAuth callback token-exchange failures usually point to bad credentials

The `OAuth callback failed during token exchange` error usually means the credentials used to complete the auth flow are incorrect, most often the client secret. Re-enter or update the client secret in the Google Ads auth config, make sure there are no leading/trailing spaces, and initiate a new connection.

## What do custom Google OAuth apps need for white-label consent?

For Google toolkits, creating a new authConfig with the user's OAuth app credentials is not enough for full white-label consent. They also need to route the callback through their own domain using their own redirect URI so Google displays the configured consent screen for that OAuth app.
