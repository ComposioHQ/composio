Slack admin conversation writes require an Enterprise Grid organization; `admin.conversations:write` alone is not sufficient.

## Check all four requirements

For Enterprise admin actions such as channel deletion, verify the organization plan, an organization-wide app installation, the installing user's Org Admin or Owner status plus Channel Management role, and the token's `admin.conversations:write` scope.

## Recover from admin errors

1. Confirm the action is an Enterprise organization action in the [Slack toolkit](/toolkits/slack).
2. Have the qualified administrator install the app across the organization.
3. Reconnect to issue a token with the required scope, then retry.

Do not describe any paid workspace as sufficient, and do not treat the scope as a membership or role bypass. Slack lists these requirements for [admin.conversations.delete](https://docs.slack.dev/reference/methods/admin.conversations.delete/) and [admin.conversations.create](https://docs.slack.dev/reference/methods/admin.conversations.create/).
