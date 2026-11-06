## How do I set up custom OAuth credentials for LinkedIn?

For a step-by-step guide on creating and configuring your own LinkedIn OAuth credentials with Composio, see [How to create OAuth credentials for LinkedIn](https://composio.dev/auth/linkedin).

## Why am I getting 429 rate limit errors on LinkedIn?

The default OAuth app is shared across users and has strict rate limits. Use your own OAuth app for production to avoid shared quotas.

## Why can't I use certain LinkedIn scope combinations?

LinkedIn restricts certain scope combinations. For example, `w_member_social` and `r_organization_admin` cannot be used together. If you need conflicting scopes, create your own OAuth app with the required permissions.

## Why does LINKEDIN_CREATE_LINKED_IN_POST fail with 426 NONEXISTENT_VERSION?

The request ran on a retired LinkedIn API version header. In Composio this usually means the call ran on the base toolkit version `00000000_00` or another older pinned version instead of a current LinkedIn toolkit version. The `LinkedIn-Version` header itself is set server-side, so the client-side fix is selecting a current toolkit version:

```python
from composio import Composio

composio = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={"linkedin": "latest"},
)
```

```typescript
import { Composio } from "@composio/core";

const composio = new Composio({
    apiKey: "YOUR_API_KEY",
    toolkitVersions: { linkedin: "latest" },
});
```

```bash
export COMPOSIO_TOOLKIT_VERSION_LINKEDIN="latest"
```

When listing tools over REST, pass the version explicitly: `GET /api/v3/tools?toolkit_slug=linkedin&toolkit_versions=latest&limit=100`. Note that manual `tools.execute()` calls require a pinned `YYYYMMDD_NN` toolkit version via `version=` — `"latest"` is rejected there — while agentic flows resolve the configured version automatically. If the error persists on a current toolkit version, collect the failed call `logId` or request ID so the actual `LinkedIn-Version` header can be verified.
