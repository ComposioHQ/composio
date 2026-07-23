For an Outlook action that exposes `user_id` or a mailbox target, pass the shared mailbox's address (UPN) to select that mailbox. The address selects the target; it does not grant access.

## Confirm access first

The caller must already have the tenant and Graph permissions needed for the chosen authentication model:

- Delegated access requires tenant delegation and the applicable `Mail.*.Shared` OAuth permission.
- Application or server-to-server access requires the applicable Graph application permission and tenant admin consent.

## Target the mailbox

After those prerequisites are in place, set the action's mailbox or `user_id` field to the shared mailbox address and retry the action. Apply this only to Outlook actions that actually expose such a target field.

Use [Composio authentication](/docs/authentication) to reconnect after changing access, and see Microsoft Graph's [shared and delegated mail folders guidance](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders) for provider permission details.
