## How do I set up custom OAuth credentials for LinkedIn?

For a step-by-step guide on creating and configuring your own LinkedIn OAuth credentials with Composio, see [How to create OAuth credentials for LinkedIn](https://composio.dev/auth/linkedin).

## Why am I getting 429 rate limit errors on LinkedIn?

The default OAuth app is shared across users and has strict rate limits. Use your own OAuth app for production to avoid shared quotas.

## Why can't I use certain LinkedIn scope combinations?

LinkedIn restricts certain scope combinations. For example, `w_member_social` and `r_organization_admin` cannot be used together. If you need conflicting scopes, create your own OAuth app with the required permissions.

---
