## BigQuery supports managed OAuth2, custom OAuth2, and service-account auth

Use Composio-managed OAuth for the standard connection flow. Use a custom Google
OAuth app when you need control over scopes, consent-screen branding,
or Google Cloud project policy. Service-account authentication is also available;
grant the service account only the BigQuery permissions required by the intended
tools.

If Google blocks an OAuth consent flow, check the OAuth app's verification,
test-user, organizational-policy, and requested-scope settings before treating
the failure as a Composio problem. Generate a fresh auth link after correcting
the Google Cloud configuration.
