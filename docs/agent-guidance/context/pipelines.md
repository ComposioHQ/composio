# CI/CD Pipelines

Reference for all GitHub Actions workflows related to docs.

## Docs Workflows

| Workflow                   | File                              | Trigger                                                        | What it does                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Update Data**            | `docs-update-data.yml`            | Cron (every 5h), `repository_dispatch` (Apollo deploy), manual | Fetches toolkits data, both OpenAPI specs (v3.1 + v3.0), generates API index pages for both versions, and meta tools reference. Creates PR via `peter-evans/create-pull-request` targeting `next`. Tracks: `openapi.json`, `openapi-v3.json`, `api-reference/`, `v3/api-reference/`. |
| **Sync Connect Clients**   | `docs.sync-connect-clients.yml`   | Cron (daily 8 AM UTC), manual                                  | Claude Code action syncs client definitions from `ComposioHQ/composio_dashboard` to `composio-connect.mdx`. Creates PR targeting `next`. Agent instructions: `docs/agent-guidance/agents/connect-clients-sync.md`.                                                                   |
| **Changelog → Docs**       | `docs.changelog-to-docs.yml`      | Verified finalization merge to `next`                          | Claims the manifest ID once, then Codex reads the verified SDK changelog and updates docs pages. Creates a PR targeting `next`. Agent instructions: `docs/agent-guidance/agents/changelog-docs-updater.md`.                                                                          |
| **Check Links**            | `docs-check-links.yml`            | PR changes to `docs/`                                          | Runs `bun run scripts/validate-links.ts` to catch broken internal links.                                                                                                                                                                                                             |
| **Lint + TypeScript**      | `docs-typescript-check.yml`       | PR changes to `docs/`                                          | Runs `bun run lint` (oxlint), `bun run types:check`, and `bun run build` (validates Twoslash code blocks).                                                                                                                                                                           |
| **Docs Tests**             | `docs-tests.yml`                  | PR changes to `docs/`                                          | Runs the docs test suite.                                                                                                                                                                                                                                                            |
| **Health Check**           | `docs.health-check.yml`           | Cron                                                           | Checks the live docs site is responding.                                                                                                                                                                                                                                             |
| **Changelog Notification** | `docs.changelog-notification.yml` | Verified finalization merge to `next`                          | Claims the manifest ID once, then sends the customer notification. Draft, receipt, and duplicate workflow retries are ignored.                                                                                                                                                       |
| **Doc Review**             | `claude-code-doc-review.yml`      | PR review comments with `@claude`                              | Claude Code reviews docs PRs on demand. Agent instructions: `docs/agent-guidance/agents/docs-reviewer.md`.                                                                                                                                                                           |

## SDK/Build Workflows

| Workflow                    | File                        | Trigger                 | What it does                                                                                     |
| --------------------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Generate SDK Docs**       | `generate-sdk-docs.yml`     | Manual, schedule        | Generates SDK reference documentation.                                                           |
| **TS Build**                | `ts.build.yml`              | PR changes to `ts/`     | Builds TypeScript packages.                                                                      |
| **TS Test**                 | `ts.test.yml`               | PR changes to `ts/`     | Runs TypeScript tests.                                                                           |
| **TS E2E**                  | `ts.test-e2e.yml`           | PR changes to `ts/`     | Runs E2E tests (Node, Deno, Cloudflare).                                                         |
| **TS Typecheck**            | `ts.typecheck.yml`          | PR changes to `ts/`     | TypeScript type checking for SDK.                                                                |
| **TS Release**              | `ts.release.yml`            | Push to `next`, manual  | Creates Changesets release PRs and publishes TypeScript packages.                                |
| **TS Audit**                | `ts.audit.yml`              | Cron                    | Security audit of npm dependencies.                                                              |
| **Build CLI Binaries**      | `build-cli-binaries.yml`    | Release                 | Builds CLI binaries for distribution.                                                            |
| **CLI Test Installation**   | `cli.test-installation.yml` | PR changes to CLI       | Tests CLI installation flow.                                                                     |
| **Python Check**            | `py.check.yaml`             | PR changes to `python/` | Linting and type checking for Python SDK.                                                        |
| **Python Test**             | `py.test.yml`               | PR changes to `python/` | Runs Python tests.                                                                               |
| **Python Release**          | `py.release.yml`            | `py@*` tags, manual     | Builds and publishes Python packages.                                                            |
| **SDK Release Coordinator** | `sdk.release.yml`           | Manual                  | Prepares a shadow SDK release PR and reproducibility evidence; registry writers remain disabled. |

## SDK Release Coordinator Shadow Mode

`.github/workflows/sdk.release.yml` is the single typed entry point for the
future SDK coordinator. During shadow mode, only `prepare` is operational.
`publish`, `resume`, and `verify` fail closed, and the
`SDK_RELEASE_PUBLISH_ENABLED` repository variable remains false. The workflow
contains the final direct npm and PyPI publisher jobs, but every production path
also has an explicit always-false cutover guard. No publisher job or registry
OIDC token can be created until the sole-writer cutover removes that guard.

A preparation is keyed by a stable `release_id` and targets
`release/sdk-<release_id>` at `next`. Only one machine-marked preparation PR
lineage may be open. A retry updates that compatible PR with a normal
fast-forward push; stale or divergent branches stop before the write.

Preparation builds the selected TypeScript and/or Python artifacts twice in
clean worktrees. The primary files are retained only after the
verification-only build reproduces the complete filename and SHA-256 set; the
second build is then discarded. npm tarballs additionally record and reproduce
their SHA-512 Subresource Integrity value. The preparation manifest records
selected and skipped ecosystems, versions, primary artifact hashes, changelog
metadata, and the workflow run and attempt. Its `base_commit` is read from the
exact primary `next` checkout rather than inferred from the workflow event.
Changelog PR evidence is collected from the exact commit range between the
latest merged release tag for each selected ecosystem and that captured base
commit. Combined releases use the common ancestor of those reviewed anchors;
associated PRs are deduplicated and bounded before generation.

After the preparation PR is updated, a credential-free shadow job queries the
exact npm and PyPI versions. npm reconciliation checks the sealed dist-tag,
registry integrity, and downloaded tarball bytes. PyPI reconciliation compares
the complete wheel/sdist filename-to-SHA-256 set. Each package is classified as
`absent`, `exact`, or `conflict`; any conflict clears every candidate publish
handoff. Absent files are copied into registry-specific local directories only
after their sealed digests are rechecked. Shadow mode reports this matrix but
still has no registry write authority.

The changelog generator is isolated from the GitHub writer. Only its generation
step receives `OPENAI_API_KEY`, and it hands validated JSON, deterministic MDX,
and generation metadata to a separate GitHub App writer. Drafts remain under
`.github/sdk-release/drafts/<release_id>.mdx`; shadow mode never writes the
public changelog collection or a package registry. A real Responses API canary
is an explicit preparation-only manual input. Ordinary tests use fixture and
mock responses.

A retry reads the existing stable branch and reconstructs the complete
generation record from its strict draft manifest. Unchanged generated drafts
are reused without an API call, committed human edits are preserved byte for
byte, and changed input after a human edit fails for manual resolution. An
explicit reset regenerates the draft, increments its reset record, and
invalidates prior review. The writer accepts either a clean new version patch
or the exact already-applied patch; partial patches, stale base commits, and a
branch that advances between inspection and writing fail closed.

The preparation branch records a structurally sealed candidate manifest, but
open-branch bytes are not publication authority. Publication resolution requires
the exact machine-marked preparation PR to be merged into `next`, then binds the
manifest ID to those canonical bytes and that merge commit. It retrieves the
primary artifact from the manifest's original prepare run and attempt, verifies
that run's repository/workflow identity, and re-hashes every file before any
protected job. If the Actions artifact has expired, the coordinator rebuilds
from the sealed source with the pinned toolchains and proceeds only when every
rebuilt byte reproduces the sealed digest.

Once cutover is explicitly enabled, absent npm and PyPI artifacts flow into two
direct, top-level `sdk-production` jobs with job-scoped OIDC. npm uses a
supported pinned toolchain and publishes dependency-first with each sealed
dist-tag. PyPI uses one pinned publisher action with `skip-existing` disabled.
Both empty and non-empty attempts return to exact live reconciliation. Terminal
attempts append immutable PR comments, update one machine-owned receipt index,
and create or reuse manifest-bound annotated tags only after verification.
Partial and conflicting attempts remain resumable from registry truth; no
workflow path unpublishes or overwrites a version.
Before another release starts, the coordinator reconstructs trusted receipt
indexes and rejects a different `release_id` while any prior attempt remains
partial. Configure `RELEASE_BOT_LOGIN` to the exact Bot login that authors
those comments; user-authored marker lookalikes are ignored.

After exact verification, the coordinator validates the complete verified
receipt and opens or updates
`release/sdk-<release_id>-changelog`. That PR copies the reviewed draft bytes
without mutation into the deterministic public path. Existing exact content is
an idempotent success; same-day entries receive a release-ID suffix and a
conflicting suffixed path fails closed. Repository-protected docs checks govern
the merge. Auto-merge is requested only when the repository already enables it;
otherwise the single finalization PR is the explicit remaining step.

Downstream docs automation and Slack resolve the merge's associated PR and
require its exact manifest marker. Each channel records a trusted Bot-authored
completion marker only after its side effect succeeds. This makes preparation
merges, finalization retries, and already-public content downstream no-ops
without consuming a failed delivery's retry. Package verification is durable
if changelog finalization itself fails; rerun `resume` or `verify` to retry from
the verified receipt rather than republishing.

Run the shadow contract locally with:

```bash
pnpm sdk-release:test
pnpm sdk-release:validate
pnpm test:release-workflow
```

## Other Workflows

| Workflow              | File                             | Trigger                          | What it does                                     |
| --------------------- | -------------------------------- | -------------------------------- | ------------------------------------------------ |
| **Claude Code**       | `claude.yml`                     | Issue/PR comments with `@claude` | General-purpose Claude Code for repo-wide tasks. |
| **Secrets Detection** | `security.secrets-detection.yml` | PR                               | Scans for accidentally committed secrets.        |
| **Stale**             | `stale.yml`                      | Cron                             | Marks stale issues and PRs.                      |

## Key Patterns

- **Docs PRs always target `next`**, not `master`
- **Auto-PR workflows** use `peter-evans/create-pull-request` or manual `gh pr create`
- **AI agent workflows** use agent instruction files in `docs/agent-guidance/agents/`
- **Scheduled workflows** that checkout code for `next`-targeted PRs must use `ref: next`
