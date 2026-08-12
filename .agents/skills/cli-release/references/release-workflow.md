# CLI Release Workflow

## Contents

- [Sources Of Truth](#sources-of-truth)
- [Choose The Path](#choose-the-path)
- [Changeset Rule](#changeset-rule)
- [Inspect Candidates](#inspect-candidates)
- [Build A Manual Beta](#build-a-manual-beta)
- [Promote A Beta To Stable](#promote-a-beta-to-stable)
- [Verify Completion](#verify-completion)
- [Failure Recovery](#failure-recovery)

## Sources Of Truth

- `.github/workflows/build-cli-binaries.yml` owns beta and stable GitHub Releases.
- `.github/scripts/cli-release/resolve-release-target.sh` decides the tag and source commit.
- `.github/scripts/cli-release/verify-assets.sh` defines the required asset set.
- `.github/workflows/cli.test-installation.yml` validates installers after publication.
- `.changeset/config.json` ignores `@composio/cli` and `@composio/cli-local-tools`.

`ts.release.yml` is the TypeScript SDK/npm release train. It is not the normal CLI binary release path.

## Choose The Path

| Goal                        | Path                                                           | Result                                                                  |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Ship an ordinary CLI change | Merge the reviewed PR to `next`                                | The push builds a rolling beta automatically.                           |
| Build a beta from a branch  | Dispatch `build-beta` at that branch                           | A prerelease is built from the branch commit.                           |
| Publish a stable CLI        | Promote an existing tested beta                                | The beta's source commit is rebuilt and published under the stable tag. |
| Resume a failed promotion   | Re-run or re-dispatch the same beta after inspecting the draft | An unpublished draft can be resumed and its assets replaced.            |

The private CLI `package.json` uses a development sentinel and never selects a
binary version. If a release owner needs an intentional minor or major version,
dispatch an explicitly versioned beta, verify it, and promote that exact beta.

## Changeset Rule

Never create a `.changeset/*.md` entry for `@composio/cli` or `@composio/cli-local-tools` while those packages remain in `.changeset/config.json#ignore`.

An ignored-package changeset makes `changesets/action` enter version-PR mode, while `changeset version` emits no commit. The action then fails with `No commits between next and changeset-release/next` and blocks unrelated SDK publishing.

If a CLI change needs a human-facing note, update `ts/packages/cli/CHANGELOG.md` directly. Run this guard before handoff:

```bash
pnpm validate:changesets
```

## Inspect Candidates

Use live GitHub state. Do not select a beta from local tags or remembered versions.

```bash
REPOSITORY=ComposioHQ/composio

gh release list \
  --repo "$REPOSITORY" \
  --limit 100 \
  --json tagName,isPrerelease,isDraft,publishedAt \
  --jq '.[] | select(.tagName | startswith("@composio/cli@")) | select(.isPrerelease and (.isDraft | not))'
```

For the chosen candidate, require a published prerelease and inspect its commit and assets:

```bash
BETA_TAG='@composio/cli@0.0.0-beta.000'

gh release view "$BETA_TAG" \
  --repo "$REPOSITORY" \
  --json tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets \
  --jq '{tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets:[.assets[] | {name,state}]}'
```

The beta must have `isDraft: false`, `isPrerelease: true`, and these six assets in `uploaded` state:

- `composio-linux-x64.zip`
- `composio-linux-aarch64.zip`
- `composio-darwin-x64.zip`
- `composio-darwin-aarch64.zip`
- `composio-skill.zip`
- `checksums.txt`

Find the beta workflow run by its target commit and require it to be green, including the reusable installation-test jobs:

```bash
TARGET_COMMIT='replace-with-targetCommitish'

gh run list \
  --repo "$REPOSITORY" \
  --workflow build-cli-binaries.yml \
  --commit "$TARGET_COMMIT" \
  --limit 10
```

If the user asked for a stable release without naming a beta, show the candidate and stop for confirmation before dispatching.

## Build A Manual Beta

Use this only when an explicit beta build is requested. The selected ref
supplies both the workflow definition and source commit. Omit `version` for the
normal next-patch beta, or provide an exact `major.minor.patch` base for an
intentional minor or major release.

```bash
SOURCE_BRANCH='replace-with-branch'

gh workflow run build-cli-binaries.yml \
  --repo "$REPOSITORY" \
  --ref "$SOURCE_BRANCH" \
  --raw-field action=build-beta
```

For an intentional minor or major, add a version newer than the latest stable:

```bash
gh workflow run build-cli-binaries.yml \
  --repo "$REPOSITORY" \
  --ref "$SOURCE_BRANCH" \
  --raw-field action=build-beta \
  --raw-field version=0.3.0
```

Watch the returned run through publication and installation tests. A beta is not a stable release.

## Promote A Beta To Stable

Derive the stable tag by removing the beta suffix, then ensure no published stable release already exists:

```bash
STABLE_TAG="${BETA_TAG%%-beta.*}"

gh release view "$STABLE_TAG" --repo "$REPOSITORY" --json tagName,isDraft,isPrerelease,publishedAt
```

- If the stable tag is absent, promotion may proceed.
- If it is a draft, the promotion can resume it.
- If it is already published, stop. Never overwrite a published release.

Dispatch the current workflow from `next`; `promote-stable` resolves the source commit from the beta release itself:

```bash
gh workflow run build-cli-binaries.yml \
  --repo "$REPOSITORY" \
  --ref next \
  --raw-field action=promote-stable \
  --raw-field beta_tag="$BETA_TAG"
```

Use the returned URL when available. Otherwise identify the new dispatch, verify its creation time and actor, then watch it:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --workflow build-cli-binaries.yml \
  --event workflow_dispatch \
  --branch next \
  --limit 5

gh run watch RUN_ID --repo "$REPOSITORY" --compact --exit-status
```

## Verify Completion

Do not call the release complete until all of these are true:

1. `Build CLI Binaries` completed successfully.
2. The stable release is published with `isDraft: false` and `isPrerelease: false`.
3. All six canonical assets are present and uploaded.
4. The workflow's installation-test matrix passed.

```bash
gh release view "$STABLE_TAG" \
  --repo "$REPOSITORY" \
  --json tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets \
  --jq '{tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets:[.assets[] | {name,state}]}'
```

Report the stable tag, promoted beta, target commit, workflow URL, asset count and state, and installation result.

## Failure Recovery

- **Build matrix failed:** no release should publish. Fix the source, produce a new beta, and promote that candidate.
- **Draft exists, publish did not finish:** inspect the failure, then re-run or re-dispatch the same beta. Draft assets are safely replaced with `--clobber`.
- **Duplicate run says the release is already published:** this is an intentional safety failure. Verify the published release and stop the duplicate.
- **Installation failed after publication:** do not mutate the published tag. Fix forward through a new beta and the next stable patch.
- **TS release says there are no commits for the release PR:** remove any pending Changeset that targets an ignored CLI package, preserve its note in the CLI changelog, run `pnpm validate:changesets`, and let the next push retry the SDK release train.
