## DigitalOcean OAuth errors before consent

If DigitalOcean's authorization page fails before consent with messages such as "parameters are not supported" or "client_id query parameter is not valid", the OAuth request did not complete and no provider token was issued. Verify the DigitalOcean OAuth app's client ID, redirect URI, and allowed authorization parameters, then start a fresh connection. If OAuth is blocked for the workflow, use DigitalOcean API-key/token auth where available.
