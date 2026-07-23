Private Slack conversations need a separate history scope for each conversation type: `groups:history` for private channels, `im:history` for one-to-one DMs, and `mpim:history` for group DMs.

## Scope does not replace membership

The Slackbot default bot scopes include `channels:history`, but not these private-conversation history scopes. Adding a scope never bypasses Slack membership or workspace policy: the app must also be a member of the conversation.

## Update the grant

1. Add the required history scope to the custom Slack app and auth config.
2. Reinstall or reconnect so the connection receives the new grant.
3. Add the app to the private conversation, then retry from the [Slackbot toolkit](/toolkits/slackbot).

Keep plan-dependent search behavior separate from this diagnosis. Slack documents the provider scopes for [private channels](https://docs.slack.dev/reference/scopes/groups.history/), [DMs](https://docs.slack.dev/reference/scopes/im.history/), and [group DMs](https://docs.slack.dev/reference/scopes/mpim.history/).
