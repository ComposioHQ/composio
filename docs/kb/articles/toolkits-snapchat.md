## Snapchat uses customer-owned OAuth credentials

The current `snapchat` toolkit supports OAuth2 and requires a Snapchat app's
client ID and client secret. Register the exact redirect URI shown by the
current Composio auth-config flow and request only the Snapchat permissions
approved for that app.

If Snapchat rejects the authorization request before the user signs in, verify
the client ID, redirect URI, and approved scopes on the Snapchat app. A
pre-login authorization error is not evidence that the user's Snapchat
password is wrong.
