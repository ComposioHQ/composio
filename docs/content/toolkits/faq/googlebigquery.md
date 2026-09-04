## Why do I see "This app is blocked" when connecting Google BigQuery?

Google can show "This app is blocked" during the BigQuery OAuth flow when the OAuth app requests Google scopes that are not approved or verified for that app.

For managed Google BigQuery OAuth, this can happen because Composio's managed OAuth app does not yet have the required BigQuery scope approved. That scope is still under verification, which is why Google can block the connection.

To unblock production usage, use your own verified Google OAuth app in a custom auth config with the BigQuery scopes your workflow needs, then reconnect the account. If your setup can use service-account auth for BigQuery, that can also avoid the user-consent OAuth screen.
