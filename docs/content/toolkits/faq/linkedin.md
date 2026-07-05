## How do I set up custom OAuth credentials for LinkedIn?



For a step-by-step guide on creating and configuring your own LinkedIn OAuth credentials with Composio, see [How to create OAuth credentials for LinkedIn](https://composio.dev/auth/linkedin).

## Why am I getting 429 rate limit errors on LinkedIn?



The default OAuth app is shared across users and has strict rate limits. Use your own OAuth app for production to avoid shared quotas.

## Why can't I use certain LinkedIn scope combinations?



LinkedIn restricts certain scope combinations. For example, `w_member_social` and `r_organization_admin` cannot be used together. If you need conflicting scopes, create your own OAuth app with the required permissions.

---

## What is needed for LinkedIn company-page posting?



Composio's managed LinkedIn OAuth app is intended for personal-profile posting and includes personal scopes such as `w_member_social`. Company-page posting requires organization scopes such as `w_organization_social` and often `r_organization_admin`. LinkedIn restricts combining some personal and organization scopes, such as `w_member_social` and `r_organization_admin`, in the same OAuth grant. For company-page posting, create your own LinkedIn OAuth app, request/approve the organization products/scopes in LinkedIn, create a custom auth config in Composio with those credentials/scopes, reconnect, and pass the company page URN like `urn:li:organization:<id>` when posting.

## When should I use Connect MCP instead of legacy Platform MCP for consumer LinkedIn connector flows?



For consumer/client connector flows, use `connect.composio.dev` / Connect MCP rather than the legacy Platform MCP endpoint. Connect handles OAuth with Claude directly and does not require an API key in the URL. If LinkedIn MCP calls fail with 401 despite an active connection, confirm which MCP endpoint the user is using and collect the exact error/log ID.
