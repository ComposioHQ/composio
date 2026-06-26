## What does GitHub Apps need?

For GitHub App based access, the user must install the GitHub App on the relevant account or organization and grant repository access. GitHub App permissions are configured on the GitHub App itself; Composio authConfig scopes do not control those permissions. Complete the GitHub App installation and repository-access grant before relying on GitHub App based tool calls. For standard user-authorized GitHub workflows, OAuth remains the simpler setup path.

## How should I handle gitHub V2 triggers do not require creating a webhook endpoint first?

GitHub V2 trigger setup does not require a separate webhook endpoint creation step. The webhook URL is automatically provisioned when the trigger instance is created. Skip the `/webhook_endpoints` call and create or update the trigger directly through `/trigger_instances/{slug}/upsert`.

## How should I handle list GitHub organizations and repositories for the authenticated user?

Use `GITHUB_LIST_ORGANIZATIONS_FOR_THE_AUTHENTICATED_USER` to list organizations available to the authenticated GitHub user. Then use `GITHUB_LIST_ORGANIZATION_REPOSITORIES` to list repositories for a selected organization. During connection, the user should be able to choose the organization they want to grant access to.

## Why GitHub connected-account tokens may show as REDACTED?

Connected-account responses redact provider tokens and other secrets. If you need to call a GitHub API endpoint that is not exposed as a tool, use Proxy Execute so Composio injects the credentials without returning the raw token to your application.

## How should I handle access-token freshness when retrieving tokens for direct GitHub operations?

You can retrieve the provider token from the connected account through the SDKs. Composio refreshes access tokens automatically, with refresh checks happening about every 15 minutes. A token fetched from the connected account remains valid only for the provider's validity window, which can be a few minutes to a few hours depending on the provider. For long-running direct operations, fetch a fresh token from the connected account again instead of caching one indefinitely.

## What should I know about Session-level tool allowlists?

Session-level restrictions are enforced server-side at execution time. When a session is configured with `toolkits`, `tools`, or `tags`, every execution request is validated against the enabled or disabled toolkit list, per-toolkit tool list, and tag filters. Disabled tools are filtered from search results, and execution is blocked before the provider API call if the tool fails validation.

## When should I use custom OAuth credentials for branded GitHub consent and redirect flows?

Composio supports white-labeling the hosted auth page by customizing the logo and app name in Project Settings > Auth Screen. For provider OAuth consent screens such as GitHub, use your own OAuth app credentials so the provider consent screen shows your brand instead of Composio's shared OAuth app. Redirect URLs can also be routed through your own domain so users do not see a Composio domain during the redirect path.
