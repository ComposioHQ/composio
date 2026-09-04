## Google Ads developer token now belongs on the auth config, not connection initiation

Google Ads was changed so the developer token lives on the auth config itself, not on each connection initiation request. Older auth configs created before this change do not have the developer token field, and new connections through those auth configs can fail because the token is no longer accepted at the connection level. Create a new Google Ads authConfig with the developer token included, then create a fresh connection through that authConfig.

## Google Ads API requires both OAuth access token and developer token

Google Ads API requests require both an OAuth access token and a Google Ads developer token. For production reliability and isolated provider quota, customers should use their own Google Ads developer token where possible.

## Google Ads toolkit versions should be passed without the dashboard `v` prefix

The SDK expects toolkit version strings without the dashboard's leading `v`. If the dashboard shows `v<version>`, pass `<version>` in `toolkitVersions` or per-execution `version`. `dangerouslySkipVersionCheck` is a per-execution option inside the `tools.execute()` payload, not a constructor option. Sessions can manage toolkit versions automatically if the customer migrates to session-based execution.

## Google Ads MCC/sub-account customer ID targeting is supported

The Google Ads toolkit now correctly supports an optional per-call `customer_id` for customer-scoped tools.

- Pass the child/subaccount customer ID as `customer_id`; it becomes the target account in the Google Ads request path.
- If `customer_id` is omitted, the tool falls back to the Customer ID stored on the connection.
- When the requested customer differs from the connection Customer ID, the connection Customer ID can supply the MCC/manager context for Google's `login-customer-id` header unless that header is already present.
- `GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` is for account discovery. It can return accessible IDs, but later customer-scoped tools still need a selected target customer ID.

If the request still fails, contact Composio support with the exact tool, request/log ID, manager/MCC customer ID, child customer ID, and Google error. The customer-ID override is already supported, so do not troubleshoot this as a pending feature.

## Campaign mutate 400s can be caused by unsupported inline Campaign fields

`GOOGLEADS_MUTATE_CAMPAIGNS` may fail with Google Ads 400 `INVALID_ARGUMENT` errors such as `Unknown name "dailyBudget" at operations[0].update` or `Unknown name "targetedLocations" ... Cannot find field`. These failures happen when the request includes fields that are not valid inline Campaign resource fields.

Do not treat these as OAuth failures. Check the tool execution log for rejected payload fields. Google Ads does not accept `daily_budget`, `targeted_locations`, `exclusion_locations`, and related date/budget/location fields directly on the Campaign mutate body.

Remove those inline fields and treat the error as a request-shape issue rather than an OAuth failure. A real daily budget requires a CampaignBudget resource (`campaignBudgets:mutate`) and then passing the CampaignBudget resource name through `campaign_budget`. Location targeting belongs in CampaignCriterion mutations, not inline Campaign fields.

Example response: "The failure is in the Google Ads campaign-mutate payload shape, not your connection. Some inline campaign fields are being sent in a form that Google Ads rejects. Use CampaignBudget and CampaignCriterion mutations for budget and location targeting instead."

## Google Ads OAuth callback token-exchange failures usually point to incorrect credentials

The `OAuth callback failed during token exchange` error usually means the credentials used to complete the auth flow are incorrect, most often the client secret. Re-enter or update the client secret in the Google Ads auth config, make sure there are no leading/trailing spaces, and initiate a new connection.

## Custom Google OAuth apps need callback routing through the customer's domain for branded consent

For Google toolkits, creating a new authConfig with the customer's OAuth app credentials is not enough for full white-label consent. They also need to route the callback through their own domain using their own redirect URI so Google displays the configured consent screen for that OAuth app.
