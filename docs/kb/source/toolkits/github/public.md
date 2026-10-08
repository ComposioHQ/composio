---
type: "reference"
title: "GitHub"
description: "Public support knowledge for GitHub."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "github"
---
# GitHub


## GitHub V2 triggers do not require creating a webhook endpoint first

GitHub V2 trigger setup does not require a separate webhook endpoint creation step. The webhook URL is automatically provisioned when the trigger instance is created. Skip the `/webhook_endpoints` call and create or update the trigger directly through `/trigger_instances/{slug}/upsert`.

## List GitHub organizations and repositories for the authenticated user

Use `GITHUB_LIST_ORGANIZATIONS_FOR_THE_AUTHENTICATED_USER` to list organizations available to the authenticated GitHub user. Then use `GITHUB_LIST_ORGANIZATION_REPOSITORIES` to list repositories for a selected organization. During connection, the user should be able to choose the organization they want to grant access to.

## GitHub connected-account tokens are redacted from API responses

Provider tokens are redacted from connected-account API responses for both Composio-managed and customer-owned auth configs. Use Composio tool execution or Proxy Execute when a workflow needs to call GitHub; do not build a flow that reads the OAuth token from connected-account data.

## GitHub organization access can require approval from an organization owner

If a GitHub connection works for personal repositories but cannot access an
organization, check whether that organization restricts OAuth app access. The
user can open GitHub **Settings → Applications → Authorized OAuth Apps**, select
the OAuth app, and request access for the organization. An organization owner
must approve the request in GitHub; reconnecting in Composio does not bypass the
organization's policy.

GitHub documents the member request flow at
<https://docs.github.com/en/account-and-profile/how-tos/organization-membership/requesting-organization-approval-for-oauth-apps>
and the owner approval flow at
<https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization>.

## Session-level tool allowlists are enforced server-side at execution time

Session-level restrictions are enforced server-side at execution time. When a session is configured with `toolkits`, `tools`, or `tags`, every execution request is validated against the enabled or disabled toolkit list, per-toolkit tool list, and tag filters. Disabled tools are filtered from search results, and execution is blocked before the provider API call if the tool fails validation.

## Use custom OAuth credentials for branded GitHub consent and redirect flows

Composio supports white-labeling the hosted auth page by customizing the logo and app name in Project Settings > Auth Screen. For provider OAuth consent screens such as GitHub, use your own OAuth app credentials so the provider consent screen shows your brand instead of Composio's shared OAuth app. Redirect URLs can also be routed through your own domain so users do not see a Composio domain during the redirect path.
