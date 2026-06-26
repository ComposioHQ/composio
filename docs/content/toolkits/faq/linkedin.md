## How do I set up custom OAuth credentials for LinkedIn?

For a step-by-step guide on creating and configuring your own LinkedIn OAuth credentials with Composio, see [How to create OAuth credentials for LinkedIn](https://composio.dev/auth/linkedin).

## Why am I getting 429 rate limit errors on LinkedIn?

The default OAuth app is shared across users and has strict rate limits. Use your own OAuth app for production to avoid shared quotas.

## Why can't I use certain LinkedIn scope combinations?

LinkedIn restricts certain scope combinations. For example, `w_member_social` and `r_organization_admin` cannot be used together. If you need conflicting scopes, create your own OAuth app with the required permissions.

---

## How do I fix LinkedIn 426 NONEXISTENT_VERSION by using the latest toolkit version?

LinkedIn 426 `NONEXISTENT_VERSION` errors usually mean the request is using an older LinkedIn API version header. In Composio, this often happens when calls run on the base toolkit version `00000000_00` or another older pinned version. Specify the latest LinkedIn toolkit version on tool calls, or pin to the current fixed version if needed. If the error persists after switching to the latest version, collect a failed call `logId` or request ID so the actual `LinkedIn-Version` header can be verified.

## How should I handle fetch modern LinkedIn tools with `toolkit_slug=linkedin` and `toolkit_versions=latest`?

The v3 tools-list endpoint defaults to the base toolkit version when no toolkit version is specified, which can return only legacy LinkedIn slugs. Use the singular filter `toolkit_slug=linkedin`; plural or alternate filters such as `toolkit_slugs`, `toolkits`, `app`, or `app_names` may be ignored. Add `toolkit_versions=latest` or an explicit version such as `20240624_00`. Example: `GET /api/v3/tools?toolkit_slug=linkedin&toolkit_versions=latest&limit=100`.

## What does Company-page posting need?

Composio's managed LinkedIn OAuth app is intended for personal-profile posting and includes personal scopes such as `w_member_social`. Company-page posting requires organization scopes such as `w_organization_social` and often `r_organization_admin`. LinkedIn restricts combining some personal and organization scopes, such as `w_member_social` and `r_organization_admin`, in the same OAuth grant. For company-page posting, create your own LinkedIn OAuth app, request/approve the organization products/scopes in LinkedIn, create a custom auth config in Composio with those credentials/scopes, reconnect, and pass the company page URN like `urn:li:organization:<id>` when posting.

## Does LinkedIn post creation support image arrays through SDK/API?

`LINKEDIN_CREATE_LINKED_IN_POST` supports image + text posting, including multiple images when using SDKs or APIs directly. Pass an array of values to the `images` field. If image posting fails, first confirm the user is using a recent toolkit version, then use failed tool-call details for troubleshooting.

## When should I use Connect MCP instead of legacy Platform MCP for consumer LinkedIn connector flows?

For consumer/client connector flows, use `connect.composio.dev` / Connect MCP rather than the legacy Platform MCP endpoint. Connect handles OAuth with Claude directly and does not require an API key in the URL. If LinkedIn MCP calls fail with 401 despite an active connection, confirm which MCP endpoint the user is using and collect the exact error/log ID.
