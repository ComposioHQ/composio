## Does Composio support GitHub Apps?

Yes. You can bring your own GitHub App by configuring its client ID and client secret in the GitHub auth config.

The GitHub App installation step is separate from the OAuth credential setup. The user still needs to install the GitHub App on the relevant account or organization and grant repository access before GitHub App based tool calls can work. GitHub App permissions come from the app's GitHub settings and installation grant, not from auth config scopes.

Composio does not currently provide the GitHub App installation link automatically during this flow. Provide your GitHub App installation link to the user, have them install the app, then complete the connection. Built-in installation-link handling is being worked on.
