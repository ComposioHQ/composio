GitHub App access requires the user to install the GitHub App on the relevant account or organization and grant it repository access. That install step is separate from OAuth, and Composio's connection flow does not currently expose it for customer-configured auth.

If you are using a GitHub App, add the installation step on your side before starting OAuth and share the install link with your users.

## Permissions live on the App

GitHub App permissions are configured on the GitHub App itself. Auth config scopes in Composio do not control them, so widening scopes in Composio will not grant repository access that the App installation does not already have.

For Composio's default [GitHub](/toolkits/github) support, standard OAuth remains the supported path and avoids the install step entirely.
