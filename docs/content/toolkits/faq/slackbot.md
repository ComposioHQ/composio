## Slackbot triggers require a verification token or subscription ID in custom auth

For Slackbot triggers with custom auth, put the Slack app verification token in the Slackbot auth config, then create a fresh connection.

## Why can repeated Slackbot connections make older connections expire?

If Slack token rotation is enabled on the Slack app, repeated connections for the same user/app can invalidate older tokens. Slack documents a two-active-token limit for token rotation: when more than two active tokens exist after a refresh, Slack revokes the oldest extra token.

This can look like older Slackbot connections expiring after a third connection or after another connection refreshes. Avoid creating multiple active Slackbot connections for the same Slack user and OAuth app unless the product is designed to handle older connections expiring. See Slack's [token rotation documentation](https://docs.slack.dev/authentication/using-token-rotation/).
