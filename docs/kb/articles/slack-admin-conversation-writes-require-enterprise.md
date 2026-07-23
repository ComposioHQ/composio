Slack admin conversation writes require an Enterprise Grid organization; `admin.conversations:write` alone is not sufficient.

## Check all four requirements

For Enterprise admin actions such as channel deletion, verify all four gates: the Enterprise Grid organization plan, an organization-wide app installation, the installing user's Org Admin or Owner status plus Channel Management role, and a **user token with `admin.conversations:write`**. A bot token with that scope is insufficient.

## Recover from admin errors

1. Confirm the action is an Enterprise organization action in the [Slack toolkit](/toolkits/slack).
2. Have the qualified administrator install the app across the organization.
3. Reconnect to issue a user token with `admin.conversations:write`, then retry.

Do not describe any paid workspace as sufficient, and do not treat the scope as a membership or role bypass. Slack lists these requirements for [admin.conversations.delete](https://docs.slack.dev/reference/methods/admin.conversations.delete/) and [admin.conversations.create](https://docs.slack.dev/reference/methods/admin.conversations.create/).
