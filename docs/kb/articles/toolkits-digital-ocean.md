## DigitalOcean supports managed OAuth2, custom OAuth2, or a personal access token

The current `digital_ocean` toolkit supports OAuth2 and API-key authentication.
Use Composio-managed OAuth for the standard connection flow. Use a custom
DigitalOcean OAuth app when you need control over provider settings;
register the exact callback URI shown by the current Composio flow.

For API-key authentication, provide a DigitalOcean Personal Access Token in the
`bearer_token` connection field. If OAuth fails before consent, compare the
authorization request with your custom app registration and use the API-key path
only when it matches your security requirements.
