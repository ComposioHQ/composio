In a Google Sheets auth config, enter full OAuth scope URIs such as `https://www.googleapis.com/auth/drive`, not shorthand such as `/drive`.

## Configure scopes precisely

Use the provider-published URI values in the current comma-separated `scopes` field. Choose the narrowest URI that supports the workflow; a broad Drive scope is not automatically appropriate.

After changing scopes, reconnect so the user grants the updated set. [Composio authentication](/docs/authentication) explains the connection flow, and Google's [OAuth scope catalog](https://developers.google.com/identity/protocols/oauth2/scopes) is the source of valid scope identifiers.
