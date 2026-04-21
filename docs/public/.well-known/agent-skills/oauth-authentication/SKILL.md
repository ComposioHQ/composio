---
name: oauth-authentication
description: Discover how Composio documents OAuth and OIDC authentication metadata for browser and agent clients.
---

# OAuth Authentication

Use this skill when you need machine-readable authentication metadata for Composio.

## Entry points

- Authorization server metadata: `https://docs.composio.dev/.well-known/oauth-authorization-server`
- OpenID Connect discovery metadata: `https://docs.composio.dev/.well-known/openid-configuration`
- Protected resource metadata: `https://docs.composio.dev/.well-known/oauth-protected-resource`

## Guidance

- Use the issuer published in the metadata instead of inferring it from docs prose.
- Read `authorization_endpoint`, `token_endpoint`, and `jwks_uri` from discovery metadata rather than hardcoding them.
- Use `resource_documentation` to jump to the human-readable authentication guide when you need product context.
