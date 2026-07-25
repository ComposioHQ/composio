Xero connections use your own Xero OAuth app credentials. Create a new auth config with those credentials — if an existing auth config still points at managed credentials, create a fresh one rather than editing it, then connect again.

## Configure the Xero app correctly

- Set the app type to **Web app**, not Mobile or Desktop.
- Make the redirect URI match the Composio auth config exactly.
- Make sure the client secret in the auth config matches the one on the Xero app.

## Remove deprecated scopes

These Xero scopes are no longer valid and produce invalid-scope, CSP, or login errors:

- `accounting.journals.read`
- `accounting.reports.read`
- `accounting.transactions`
- `accounting.transactions.read`

Remove them from the auth config and reconnect. Scope changes only apply to connections created after the change.
