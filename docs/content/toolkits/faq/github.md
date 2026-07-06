## Does Composio support GitHub Apps?

Yes. For GitHub App based access, the user must install the GitHub App on the relevant account or organization and grant repository access. GitHub App permissions are configured on the GitHub App itself; auth config scopes do not control those permissions.

Composio does not currently provide the GitHub App installation link automatically during this flow. The developer should provide their own GitHub App installation link to the user, then complete the connection after the app is installed. Built-in installation-link handling is being worked on.
