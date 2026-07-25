If your QuickBooks OAuth flow requests `com.intuit.quickbooks.payment`, the QuickBooks payment module must be enabled for that Intuit account and app. Without it, the authorization flow fails even though the credentials are correct.

If you do not need payment tools, remove that scope from the auth config and retry the connection.

## Check the credentials and redirect URL together

A QuickBooks auth config needs the OAuth credentials from your Intuit developer app, and that app needs the Composio redirect URL registered on it. A missing or mismatched redirect URL breaks the flow in a way that looks identical to a scope problem, so confirm both before changing scopes.
