## BigQuery supports customer-owned OAuth2 and Google service-account auth

Create an auth config with the customer's Google OAuth app or service-account
credentials. The current catalog does not advertise Composio-managed BigQuery
OAuth. For OAuth, configure and verify the required Google scopes and use the
redirect URL shown by Composio. For service-account auth, grant the service
account only the BigQuery permissions required by the intended tools.

If Google blocks an OAuth consent flow, check the OAuth app's verification,
test-user, organizational-policy, and requested-scope settings before treating
the failure as a Composio-side problem. Generate a fresh auth link after correcting
the Google Cloud configuration.
