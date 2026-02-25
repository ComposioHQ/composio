/**
 * Shared terminology migration table appended to all guardrail sets.
 * Maps old v1/v2 terms to current v3 equivalents so AI agents
 * can translate outdated references in error messages, docs, or user prompts.
 */
export const TERMINOLOGY_MIGRATION = `

---

## Terminology Migration (old → current)

If you encounter these terms in error messages, old documentation, or user prompts, translate them to the current equivalents. **Do not use the old terms in generated code or explanations.**

| Old term (v1/v2) | Current term (v3) | In code |
|---|---|---|
| entity ID | user ID | \`user_id\` parameter |
| actions | tools | e.g., \`GITHUB_CREATE_ISSUE\` is a *tool* |
| apps / appType | toolkits | e.g., \`github\` is a *toolkit* |
| integration / integration ID | auth config / auth config ID | \`auth_config_id\` parameter |
| connection | connected account | \`connected_accounts\` namespace |
| ComposioToolSet / OpenAIToolSet | \`Composio\` class with a provider | \`Composio(provider=...)\` |
| toolset | provider | e.g., \`OpenAIProvider\` |

If a user says "entity ID", they mean \`user_id\`. If they say "integration", they mean "auth config". Always respond using the current terminology.
`;
