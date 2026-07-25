Composio's managed Gmail OAuth app is not verified for every sensitive Gmail scope. When you request a granular sensitive scope that is not verified on the managed app, Google stops the flow with an "app is blocked" or unverified-app screen.

This is Google enforcing verification on the OAuth app, so it is not something reconnecting or changing the connection will clear.

## Use your own Google OAuth app

Create a Google OAuth app in Google Cloud Console with the scopes you need verified for it, then point Composio at it:

1. Create the [Gmail](/toolkits/gmail) auth config with your own OAuth client ID, client secret, and redirect URI.
2. Initiate a connected account through that auth config. The callback URL is supplied during connection initiation, while the client credentials and redirect URI live on the auth config.
3. Complete the flow against your own verified app.

## Scope choices worth knowing

`https://www.googleapis.com/auth/gmail.send` can send messages but is a granular sensitive scope that requires Google verification. The broader `https://mail.google.com/` scope covers send use cases with full mailbox access, which is more access than many teams want to grant.

Pass scopes on the auth config through `credentials.scopes`, typically as a comma-joined string.
