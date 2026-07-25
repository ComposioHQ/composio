Gmail filter creation maps to the Gmail API `users.settings.filters.create` endpoint. Google lists `https://www.googleapis.com/auth/gmail.settings.basic` as the required OAuth scope, and `GMAIL_CREATE_FILTER` declares that same single required scope.

Broader scopes do not substitute for it. `https://mail.google.com/` and the default managed Gmail scope set cover many other Gmail actions but not filter creation.

## If Google blocks the flow after you add the scope

Adding `gmail.settings.basic` to a managed Gmail connection can trigger Google's unverified-app screen, because verification is a property of the OAuth app rather than of your project. There are two ways forward:

- Use your own Google OAuth app that is verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.
- Otherwise, wait until `gmail.settings.basic` is confirmed as approved on the Composio-managed Gmail app before reconnecting. Reconnecting before then repeats the same block.
