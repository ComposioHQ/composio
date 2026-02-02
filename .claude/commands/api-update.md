# API Update Command

Check for open PRs in the Composio client repositories and create a plan for updating the SDKs.

## Workflow

### Step 1: Check for Open PRs

Fetch open PRs from both client repositories:

1. **TypeScript Client**: `github.com/composiohq/composio-base-ts`
2. **Python Client**: `github.com/composiohq/composio-base-py`

Use the GitHub CLI (`gh`) to list open PRs:
```bash
gh pr list --repo composiohq/composio-base-ts --state open --json number,title,url,headRefName,body
gh pr list --repo composiohq/composio-base-py --state open --json number,title,url,headRefName,body
```

### Step 2: Get PR Patches

For each open PR, fetch the diff/patch to understand the changes:
```bash
gh pr diff <PR_NUMBER> --repo composiohq/composio-base-ts
gh pr diff <PR_NUMBER> --repo composiohq/composio-base-py
```

### Step 3: Analyze Changes

For each PR, analyze the diff to identify:

1. **New API endpoints** - New methods/functions added to the client
2. **Modified parameters** - Changes to existing function signatures
3. **Deprecated endpoints** - Removed or deprecated functionality
4. **Type changes** - Updates to type definitions/schemas
5. **Breaking changes** - Any backward-incompatible changes

### Step 4: Identify SDK Impact

Map client changes to SDK files that need updates:

**TypeScript SDK (`@composio/core`)**:
- Check `ts/packages/core/src/` for affected code
- Types: `ts/packages/core/src/types/`
- Models: `ts/packages/core/src/models/`
- Services: `ts/packages/core/src/services/`

> **Important - Naming Convention for TypeScript:**
> The API uses **kebab-case** (e.g., `connected-accounts`, `auth-configs`, `tool-router`) but the TypeScript SDK uses **camelCase** (e.g., `connectedAccounts`, `authConfigs`, `toolRouter`).
> 
> When mapping API changes to TypeScript SDK:
> - Convert all kebab-case parameter names to camelCase
> - Convert all kebab-case property names to camelCase
> - Keep the original kebab-case names in comments for reference to the API
> - Example: API's `callback_url` or `callback-url` becomes `callbackUrl` in TypeScript

**Python SDK (`composio`)**:
- Check `python/composio/` for affected code
- Types and models in `python/composio/core/`
- Python typically uses snake_case which often matches API naming

### Step 5: Check Current Client Versions

Current client dependency versions:
- **TypeScript**: Check `pnpm-workspace.yaml` catalog for `@composio/client` version
- **Python**: Check `python/pyproject.toml` for `composio-client` version

### Step 6: Create Update Plan

Create a plan document in `.agent_cache/` folder with the following structure:

```
.agent_cache/
└── api-update-plan-<YYYY-MM-DD>.md
```

## Plan Document Structure

The plan document should contain:

### 1. PR Summary
- List all open PRs with their numbers, titles, and URLs
- Brief description of what each PR changes

### 2. Client Version Updates
- Current versions of both clients
- Target versions (from PR branch or proposed release)
- Files to update:
  - `pnpm-workspace.yaml` (catalog section for `@composio/client`)
  - `python/pyproject.toml` (dependencies section for `composio-client`)

### 3. TypeScript SDK Changes
For each change needed:
- File path
- Change description
- Code snippet showing before/after (if applicable)
- Whether it's a breaking change
- **Naming mapping**: Show the API name (kebab-case/snake_case) → TypeScript name (camelCase)
  - Example: `callback_url` → `callbackUrl`
  - Example: `connected-account-id` → `connectedAccountId`

### 4. Python SDK Changes
For each change needed:
- File path
- Change description
- Code snippet showing before/after (if applicable)
- Whether it's a breaking change

### 5. Breaking Changes Summary
- List all breaking changes
- Migration steps required
- Affected public APIs

### 6. Test Updates Required
- New tests to add
- Existing tests to update

### 7. Documentation Updates
- API documentation changes needed
- Changelog entries to create

## Important Notes

- **DO NOT** apply any changes to the codebase
- Only create the plan document in `.agent_cache/`
- Wait for user confirmation before proceeding with any changes
- If no open PRs are found, report that and exit
- If PRs exist but have no SDK-impacting changes, note that in the plan

## Example Output Path

`.agent_cache/api-update-plan-2026-01-22.md`

## Error Handling

- If `gh` CLI is not authenticated, prompt user to run `gh auth login`
- If repositories are not accessible, report the error
- If PR diff is too large, summarize key changes only
