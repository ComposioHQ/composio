# Stable SDK releases

One workflow, `sdk.release.yml`, releases the TypeScript SDK, the Python SDK, or both. A member requests the release, the bot opens one release PR, a reviewer approves it, and a person merges it. The workflow then publishes the files the PR checked and opens a docs PR that pins the released versions.

```text
request (issue or dispatch) → release PR (bot) → candidate checks → approve → merge
  → tag sdk-release/<id> → publish npm + PyPI → docs pin PR
```

## Request

1. Open a GitHub issue with the **SDK release** form. Every active ComposioHQ member can use it, including members with repository Read access. Repository writers can instead run **SDK release** on `next` in Actions.
2. Leave each language at `auto` to follow its changesets, or choose `patch`, `minor`, `major`, or `skip`. An explicit bump with no changesets creates a maintenance release; `auto` with no changesets replies "Nothing to release."

The bot plans versions on the current `next`, regenerates the SDK reference docs, writes the package changelogs and one docs changelog entry, and opens the release PR. Later `next` commits wait for the next release. Only one release PR is open at a time.

## Review and approve

The release PR description lists each package's old and new version, the changesets it consumes or leaves for later, and links to the changelogs and regenerated references. It names the requester, who may not approve.

1. Wait for the `SDK candidate (<language>)` and `SDK candidate smoke (<language>)` checks. The first builds the exact files that will be published. The second installs them in a clean project like a user would; for Python it also tests the new core with the latest published providers.
2. A repository writer who did not request the release approves the head.

Do not push to the release branch. The tag step accepts only the bot's commit, so a pushed commit (including **Update branch**) makes the merge fail the gate. To change the notes, fix the changesets on `next`, close the release PR, and request a new release.

## Merge and publish

A person merges the approved, green release PR under normal `next` protection. On merge, the `tag` job checks that the head is the bot's commit, the approval, and the candidate and docs checks, then tags the head `sdk-release/<id>`. If the gate fails it creates no tag and comments the fix on the PR: revert the release PR on `next`, then request the release again.

The tag run then:

1. Pins the candidate artifacts built on the release PR by ID and digest. It never rebuilds.
2. Uploads only the files npm and PyPI are missing. An existing file with identical bytes is accepted; different bytes stop the run with a conflict. npm versions are uploaded under a release-only dist-tag, and `latest` moves once every upload is visible.
3. Comments the published versions on the request issue and opens a docs PR that pins the released npm versions in `docs/package.json` and `docs/bun.lock`. Merging that PR after its checks pass is what makes twoslash type-check the docs against the released types.

If any job fails, the run comments the failed jobs and the run link on the request issue.

## Recover a failed release

Open the tag run and choose **Re-run failed jobs**. A re-run publishes the same pinned files, skips files already published, and uploads the rest. This works while the candidate artifacts exist, 30 days from the candidate build.

If the artifacts expired, or a registry already serves different bytes, add changesets for the affected packages on `next` and request a new release. It plans from the versions in `next`, so the unpublished versions are skipped and the packages move to the next version.

## Add a release note

Run from the repository root:

```bash
pnpm changeset
```

Select every affected published TypeScript package and/or the private `@composio/python-sdk` marker. The marker versions the Python core and all supported providers together; it is never published to npm. TypeScript core and slim move together, while providers keep independent versions.

One changeset can cover both languages:

```markdown
---
'@composio/core': minor
'@composio/python-sdk': patch
---

Describe the public behavior and any migration steps.
```

Put prose types such as `Array<Tool>` in code spans because summaries become MDX. Docs-only, tests-only, internal tooling, and CLI-only changes need no SDK note. If a source change doesn't affect public behavior, add `<!-- sdk-release-note-exempt: explain why public SDK behavior is unchanged -->` (at least 20 characters in the reason) to the PR description.

## Documentation

- The release PR commits the SDK reference docs, generated from the released source, and the docs changelog entry. Changelog snippets are not type-checked, because they may describe APIs released after the docs pins.
- The docs pin PR moves the docs to the released npm versions. Twoslash then checks every guide snippet against those types.
- `docs.sdk-change-sync.yml` keeps updating guides for SDK source changes; it no longer touches the version pins.

## Owner setup

Complete these hosted prerequisites before the first release.

1. Install a dedicated SDK release App with repository Contents, Pull requests, and Issues write, Actions read, and organization Members read. It needs no protection bypass on `next`. Set the `SDK_RELEASE_APP_SLUG` and `SDK_RELEASE_APP_CLIENT_ID` variables. Put `SDK_RELEASE_APP_PRIVATE_KEY` only in the `sdk-release-control` environment, restricted to `next`.
2. Protect `sdk-release/*` tags against creation, update, and deletion, with only this App allowed to bypass. Publishing trusts these tags, so check that an ordinary writer cannot create or move one.
3. Create `npm-release` and `pypi-release` environments that deploy only from `sdk-release/*` tags.
4. Register trusted publishers for `.github/workflows/sdk.release.yml` with the `npm-release` environment on every npm package, and with `pypi-release` on every PyPI package. npm allows one trusted publisher per package, so this replaces the `ts.release.yml` identity the `main` beta lane uses: decide how betas publish (an npm token in `ts.release.yml`, or a beta mode in `sdk.release.yml`) before switching. PyPI accepts several publishers.
5. Restrict pushes to `sdk-release/batch-*` branches to the App. The tag step refuses heads the App did not commit, so this only prevents confusion.
6. Keep Actions artifact retention at 30 days or more.

## CLI binaries and beta SDKs

CLI binaries keep **Build CLI Binaries** and GitHub Releases. `@composio/cli` stays excluded from changesets. Follow the [CLI release skill](../../../.agents/skills/cli-release/references/release-workflow.md).

The `main` SDK beta lane keeps `ts.release.yml`, its prerelease state and its trusted identity. `py.release.yml` keeps build-only dispatch and core prereleases.
