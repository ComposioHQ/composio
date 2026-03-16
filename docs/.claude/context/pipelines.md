# CI/CD Pipelines

Reference for all GitHub Actions workflows related to docs.

## Docs Workflows

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| **Update Data** | `docs-update-data.yml` | Cron (every 5h), `repository_dispatch` (Apollo deploy), manual | Fetches toolkits data, OpenAPI spec, API index pages, and meta tools reference. Creates PR via `peter-evans/create-pull-request` targeting `next`. |
| **Sync Connect Clients** | `docs.sync-connect-clients.yml` | Cron (daily 8 AM UTC), manual | Claude Code action syncs client definitions from `ComposioHQ/composio_dashboard` to `composio-connect.mdx`. Creates PR targeting `next`. Agent instructions: `docs/.claude/agents/connect-clients-sync.md`. |
| **Changelog → Docs** | `docs.changelog-to-docs.yml` | Push to `next` (changelog files) | Codex action reads new changelog entries and updates docs pages. Creates PR targeting `next`. Agent instructions: `docs/.claude/agents/changelog-docs-updater.md`. |
| **Check Links** | `docs-check-links.yml` | PR changes to `docs/` | Runs `bun run scripts/validate-links.ts` to catch broken internal links. |
| **TypeScript Check** | `docs-typescript-check.yml` | PR changes to `docs/` | Runs `bun run types:check` for TypeScript type checking. |
| **Docs Tests** | `docs-tests.yml` | PR changes to `docs/` | Runs the docs test suite. |
| **Health Check** | `docs.health-check.yml` | Cron | Checks the live docs site is responding. |
| **Changelog Notification** | `docs.changelog-notification.yml` | Push to `next` (changelog files) | Sends notification when new changelog entries are merged. |
| **Doc Review** | `claude-code-doc-review.yml` | PR review comments with `@claude` | Claude Code reviews docs PRs on demand. Agent instructions: `docs/.claude/agents/docs-reviewer.md`. |

## SDK/Build Workflows

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| **Generate SDK Docs** | `generate-sdk-docs.yml` | Manual, schedule | Generates SDK reference documentation. |
| **TS Build** | `ts.build.yml` | PR changes to `ts/` | Builds TypeScript packages. |
| **TS Test** | `ts.test.yml` | PR changes to `ts/` | Runs TypeScript tests. |
| **TS E2E** | `ts.test-e2e.yml` | PR changes to `ts/` | Runs E2E tests (Node, Deno, Cloudflare). |
| **TS Typecheck** | `ts.typecheck.yml` | PR changes to `ts/` | TypeScript type checking for SDK. |
| **TS Release** | `ts.release.yml` | Push to `master` | Publishes TypeScript packages. |
| **TS Audit** | `ts.audit.yml` | Cron | Security audit of npm dependencies. |
| **Build CLI Binaries** | `build-cli-binaries.yml` | Release | Builds CLI binaries for distribution. |
| **CLI Test Installation** | `cli.test-installation.yml` | PR changes to CLI | Tests CLI installation flow. |
| **Python Check** | `py.check.yaml` | PR changes to `python/` | Linting and type checking for Python SDK. |
| **Python Test** | `py.test.yml` | PR changes to `python/` | Runs Python tests. |
| **Python Release** | `py.release.yml` | Push to `master` | Publishes Python packages. |

## Other Workflows

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| **Claude Code** | `claude.yml` | Issue/PR comments with `@claude` | General-purpose Claude Code for repo-wide tasks. |
| **Secrets Detection** | `security.secrets-detection.yml` | PR | Scans for accidentally committed secrets. |
| **Stale** | `stale.yml` | Cron | Marks stale issues and PRs. |

## Key Patterns

- **Docs PRs always target `next`**, not `master`
- **Auto-PR workflows** use `peter-evans/create-pull-request` or manual `gh pr create`
- **AI agent workflows** use agent instruction files in `docs/.claude/agents/`
- **Scheduled workflows** that checkout code for `next`-targeted PRs must use `ref: next`
