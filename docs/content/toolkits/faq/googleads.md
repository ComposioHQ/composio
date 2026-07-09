## Why am I getting Google Ads quota errors after a successful login?

Google Ads API requests use both an OAuth access token and a Google Ads developer token. A successful OAuth connection only confirms that the user granted access; it does not mean the developer-token quota is dedicated to your project.

If you use Composio's managed Google Ads connector, requests may use Composio's shared Google Ads developer token. Errors like `RESOURCE_EXHAUSTED`, `rateScope: DEVELOPER`, or `Number of operations for basic access` mean Google is throttling that developer-token quota, even when your connected Google Ads account has low usage.

For a short-term retry, wait for the retry window returned by Google. For production workloads, create a custom Google Ads auth config with your own OAuth client credentials and Google Ads developer token, so quota and access limits are isolated to your Google Ads setup. See [custom auth configs](/docs/auth-configuration/custom-auth-configs).
