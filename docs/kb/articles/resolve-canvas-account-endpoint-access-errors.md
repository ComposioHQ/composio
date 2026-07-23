Canvas account-level endpoints require an account-level administrator role; course-level teacher access does not imply account administration.

## Check the same identity

This guidance applies to `CANVAS_GET_ACCOUNTS` and other account-level paths, not to every Canvas course action. Test with the same bearer identity that Composio uses, then confirm that identity has the required role for the target account.

## Recover from an empty or unauthorized result

1. Verify the account ID and the connected Canvas identity.
2. Ask a Canvas administrator to confirm that identity's account-level permissions.
3. Retry the current action from the [Canvas toolkit](/toolkits/canvas) after the provider role changes.

An empty or unauthorized response can be a provider permission boundary, not a Composio failure. Canvas documents account endpoints in its [Accounts API](https://canvas.instructure.com/doc/api/accounts.html) and provider-controlled roles in its [permissions documentation](https://canvas.instructure.com/doc/api/file.permissions.html).
