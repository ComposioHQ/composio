## How do I set up custom OAuth credentials for GitHub?

For a step-by-step guide on creating and configuring your own GitHub OAuth credentials with Composio, see [How to create OAuth credentials for GitHub](https://composio.dev/auth/github).

## Can I use a GitHub App instead of an OAuth App?

Yes. GitHub Apps are supported via the OAuth2 auth scheme in Composio. When configuring a GitHub App:

- **Scopes in authConfig are not respected.** GitHub Apps use the permissions configured on the App itself (in GitHub's developer settings), not the scopes passed in your auth config.
- **Users must install the GitHub App before authenticating.** Have users complete the GitHub App installation (granting access to repositories) before initiating the OAuth connection through Composio.
