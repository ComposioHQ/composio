## How do I pin auth config and connected account IDs in Tool Router sessions?

When creating a Tool Router session, pass the desired `authConfigId` and `connectedAccountId` in the session creation options. Use `authConfigs: { [toolkitSlug]: authConfigId }` and `connectedAccounts: { [toolkitSlug]: connectedAccountId }` so the session uses that specific connection instead of relying on discovery/default selection.
