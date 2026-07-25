Composio does not offer a managed OAuth app for X (Twitter). Create your own X developer app and configure a custom auth config with those credentials.

Before retrying a connection, verify the app settings, callback and redirect URLs, scopes, and project linkage against X's current setup requirements.

## Use the Platform, not Connect

Connect does not support custom OAuth credentials. Because X requires your own developer credentials, set the integration up from the main Composio Platform with a custom auth config — the Connect flow is not the right surface for it.

## Common setup errors

`client-not-enrolled` and `App not linked to project` almost always mean the X developer app is not attached to an X developer project, or that its OAuth configuration is incomplete. Both are fixed in the X developer portal rather than in Composio.
