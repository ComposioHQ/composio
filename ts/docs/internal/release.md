# Stable SDK releases

One procedure releases the TypeScript SDK, the Python SDK, or both. A member requests the release, the bot opens one release PR, a reviewer approves it, and a person merges it. Automation then publishes the files the PR checked and verifies the public packages.

## Request

1. Open a GitHub issue with the **SDK release** form. Every active ComposioHQ member can use it, including members with repository Read access and private organization membership. Repository writers can instead run **SDK release** on `next` in Actions.
2. Leave each language at `auto` to use its Changesets recommendations, or choose `patch`, `minor`, `major`, or `skip` for it. An explicit bump with no notes creates a maintenance release; `auto` with no notes returns "Nothing to release."
3. Leave **Supersede a stranded release** at `no`. Use `yes` only for a [stranded release](#stranded-release).

The bot opens one release PR from protected `next`. Later `next` commits and their changesets wait for the next release. The request is refused while a merged release has versions that never reached the registry; finish that release first.

## Review and approve

The release PR description lists each package's old and new version and bump, the changesets it consumes or leaves for later, and links to the package changelogs, the docs changelog entry, and the regenerated API references. It also names the requesters, who may not approve.

1. Edit the docs changelog narrative on the PR if needed. The published docs show it as written.
2. Wait for the `SDK candidate (<language>)` and `SDK candidate smoke (<language>)` checks. The first builds the exact files that will be published. The second installs those files in a clean project like a user would; for Python it also tests the candidate core with the latest published providers.
3. A repository writer who is not the PR author and did not request the release approves the final head. Any new commit needs a new approval.

A stale release PR is closed, then requested again.

## Merge

A person merges the approved, green release PR under normal `next` protection. The bot never merges.

On merge, the `source-tag` job rechecks the approval rule and the green `SDK candidate` checks on the final head, then tags it `sdk-release/<id>`. If the gate fails, for example after an admin merge without an eligible approval, it creates no tag and comments the fix on the PR: revert the release PR on `next`, then request the release again.

The tag run in `sdk.release.yml`:

1. Checks the candidate files built on the approved PR head against that build's checksums and pins those artifacts. Each publish job downloads exactly the pinned artifacts. It never rebuilds.
2. Checks the tag came from the release App at the run's commit, belongs to exactly one merged release PR with that head, and that the approval rule still holds.
3. Checks the npm and PyPI trusted publishers. Both must pass before either registry receives files.
4. Uploads only files the registries are missing. An existing file with identical bytes is accepted; different bytes stop the run with a conflict.
5. Verifies the public packages, npm provenance, stable tags, and fresh installs, then comments the published versions on the request issue and starts docs maintenance.

If any job fails, the run comments on the request issue with the failed jobs and the run link.

## Re-run failed jobs

Open the tag run and choose **Re-run failed jobs**. A re-run publishes the same pinned files, skips files already published, and uploads the rest. It works while the approved candidate artifacts exist: 30 days from the candidate build on the PR, not from the merge.

## Stranded release

A release is stranded when some of its versions never reached the registry and its candidates have expired. Request a new release with **Supersede a stranded release** set to `yes`. Every stranded npm package moves to a version above its tagged one. If any Python package is stranded, the whole Python lane moves one version above the tagged one. Files already published under the stranded versions are never touched.

## Add a release note

Run from the repository root:

```bash
pnpm changeset
```

Select every affected published TypeScript package and/or the private `@composio/python-sdk` marker. The marker versions the Python core and all supported providers together; it is never published to npm. TypeScript core and slim move together, while providers keep independent versions.

One fragment can cover both languages:

```markdown
---
'@composio/core': minor
'@composio/python-sdk': patch
---

Describe the public behavior and any migration steps.
```

Put prose types such as `Array<Tool>` in code spans because summaries become MDX. Docs-only, tests-only, internal tooling, and CLI-only changes need no SDK note. If a source change doesn't affect public behavior, add `<!-- sdk-release-note-exempt: explain why public SDK behavior is unchanged -->` (at least 20 characters in the reason) to the PR body.

## Documentation

The release PR commits the changelog entries, version tables, and API references. After a verified release, **Docs - Sync guides on SDK changes** (`docs.sdk-change-sync.yml`) rebuilds protected `next` through the Vercel deploy hook, checks the live changelog and references, and opens one maintenance PR that updates docs SDK pins and affected guides. A failed live docs check posts a warning on the request issue; it never fails the release. To retry docs maintenance, run that workflow on `next` with the tag run's ID.

Vercel deployment, Markdown, Algolia, and content freshness keep their normal paths. CLI guide maintenance and ordinary changelog notifications are unchanged.

## Owner bootstrap

Complete these hosted prerequisites before enabling the stable publisher. Local tests do not establish them.

1. Install a dedicated SDK release App with repository Contents, Pull requests, and Issues write, Actions read, and organization Members read. It needs no Administration permission or protection bypass on `next`. Set public `SDK_RELEASE_APP_ID`, `SDK_RELEASE_APP_SLUG`, and `SDK_RELEASE_APP_CLIENT_ID` variables. Put `SDK_RELEASE_APP_PRIVATE_KEY` only in `sdk-release-control`, restricted to protected `next`, without reviewers.
2. Protect `sdk-release/*` tags against creation, update, and deletion, with only this App allowed to bypass. Test that an ordinary writer and the legacy App cannot create or move one. Preserve unrelated CLI and beta tag rules.
3. Create separate `npm-release` and `pypi-release` environments without reviewers, wait timers, or custom approvals. Allow selected **Tag** deployments only for `sdk-release/*`, with no branch policy. Do not weaken the existing `pypi` environment.
4. Register trusted publishers for `.github/workflows/sdk.release.yml` with the `npm-release` environment on every in-scope npm package, and with `pypi-release` on every in-scope PyPI package. Enable npm direct publication and dist-tag operations for the new identity. Keep the shared `main` beta `ts.release.yml` identity.
5. In the production Vercel docs project, create a deploy hook bound to protected `next`. Store its URL as `VERCEL_DOCS_NEXT_DEPLOY_HOOK` only in `sdk-release-control`. See [Vercel deploy hooks](https://vercel.com/docs/deploy-hooks).
6. Confirm Actions artifacts are retained for at least 30 days. The `source-tag` gate refuses to tag a head without green `SDK candidate` and `SDK candidate smoke` checks, so branch protection need not require them.
7. Run the owner policy check from the reviewed code with an owner credential:

   ```bash
   SDK_POLICY_TOKEN="$OWNER_GITHUB_TOKEN" SDK_RELEASE_APP_ID="$SDK_APP_ID" \
     bun scripts/sdk-release/registry.ts check-policy
   ```

   GitHub hides ruleset bypass actors from callers without ruleset write access, so only an owner can verify them. Do not give publishers Administration to inspect the list.

## Stable cutover checklist

Run this as an explicitly authorized hosted rollout, before merging the activation PR.

1. Drain running, queued, and waiting legacy `ts.release.yml` and `py.release.yml` stable `next` runs. Until activation merges, do not merge a stable Version Packages PR or push a stable `py@*` tag. Preserve `main` beta runs and core prereleases.
2. Inspect `changeset-release/next`, `docs/auto-update-ts-sdk-reference`, and `docs/auto-update-python-sdk-reference` and their PRs. Save useful notes and unique commits before closing them. Do not close unrelated PRs.
3. Re-audit stable package baselines and pending notes. The final `ts.release.yml` serves `main` only; `py.release.yml` keeps build-only dispatch and core-prerelease publication. Preserve `main` beta metadata, `.changeset/pre.json`, CLI binary workflows, and shared beta trust.
4. After bootstrap, the policy check, and the drain pass, merge the activation PR normally.
5. Run one controlled member-requested release. Verify the approved head, tag, candidates, registry contents, fresh installs, and live docs. Force one publish failure and finish it with **Re-run failed jobs**.
6. Ask a colleague to request, approve, merge, and re-run using this runbook. Retire a next-only legacy PyPI identity only after the new one works and an owner confirms nothing else uses it.

## CLI binaries and beta SDKs

CLI binaries keep **Build CLI Binaries** and GitHub Releases. Merges to `next` build rolling CLI betas; stable promotion runs at an existing tested beta tag. `@composio/cli` stays excluded from Changesets. Follow the [CLI release skill](../../../.agents/skills/cli-release/references/release-workflow.md).

The `main` SDK beta lane keeps its existing workflow, prerelease state, versions, and trusted identities.
