# SDK releases

One workflow, `sdk.release.yml`, releases the TypeScript SDK, the Python SDK, or both, as a stable release or a beta. A member requests the release, the bot opens one release PR, a reviewer approves it, and a person merges it. The workflow then publishes the files the PR checked, checks that users get exactly those files, and, for a stable release, opens a docs PR that pins the released versions.

```text
request (issue or dispatch) → release PR (bot) → candidate checks → approve → merge
  → tag sdk-release/<id> → publish npm + PyPI → verify → docs pin PR (stable)
```

## Release states

The request issue always shows where the release is: one status comment that the bot edits in place, and one `sdk-release:<state>` label. `scripts/sdk-release/state.ts` lists every state and which stage can end in it.

| State         | Meaning                                                                                         | Issue  |
| ------------- | ----------------------------------------------------------------------------------------------- | ------ |
| `in-review`   | The release PR is open.                                                                         | open   |
| `publishing`  | The merged PR is tagged; the tag run is publishing.                                             | open   |
| `published`   | Every planned package is on its registry.                                                       | closed |
| `failed`      | A job failed or was cancelled. **Re-run failed jobs** resumes it.                               | open   |
| `needs-input` | The request form could not be read.                                                             | closed |
| `waiting`     | Another release PR is open. Request again after it finishes.                                    | closed |
| `blocked`     | A release merged into `next` but was never tagged. Re-run its tag job or revert its release PR. | closed |
| `empty`       | No pending changesets for the selected languages.                                               | closed |
| `abandoned`   | The release PR closed without merging.                                                          | closed |
| `refused`     | The release PR merged but failed the gate. Revert it, then request again.                       | closed |

## Request

1. Open a GitHub issue with the **SDK release** form. Every active ComposioHQ member can use it, including members with repository Read access. Repository writers can instead run **SDK release** on `next` in Actions.
2. Choose the channel: `stable`, or `beta` for a preview.
3. Leave each language at `auto` to follow its changesets, or choose `patch`, `minor`, `major`, or `skip`. An explicit bump with no changesets creates a maintenance release; `auto` with no changesets ends as `empty`.

For a stable release, the bot plans versions on the current `next`, regenerates the SDK reference docs, writes the package changelogs and one docs changelog entry, and opens the release PR. Later `next` commits wait for the next release. Only one release PR is open at a time, across both channels.

### Betas

A beta goes through the same release PR, approval, gate and tag as a stable release. Only its versions and npm dist-tag differ:

- Its versions are the ones the pending changesets would release, suffixed with the planning run: `0.29.0-beta.<run>` on npm and `0.29.0b<run>` on PyPI. Core and every Python provider release together.
- Its release PR commits only `.github/sdk-release-plan.json`. The candidate checks apply the versions where they build, so `next` keeps its stable versions and every changeset stays pending for the stable release.
- npm publishes it under the `next` dist-tag and never moves `latest`. (`beta` belongs to the 1.0 train on `main`.) pip and uv install it only with `--pre` or an exact pin.
- It needs no docs check, writes no changelog and opens no docs pin PR.

## Review and approve

The release PR description lists each package's old and new version, the changesets it consumes or leaves for later, and links to the changelogs and regenerated references. It names the requester, who may not approve.

1. Wait for the `SDK candidate (<language>)` and `SDK candidate smoke (<language>)` checks. The first builds the exact files that will be published. The second installs them in a clean project like a user would; for Python it also tests the new core with the latest published providers.
2. A repository writer who did not request the release approves the head.

Do not push to the release branch. The tag step accepts only the bot's commit, so a pushed commit (including **Update branch**) makes the merge fail the gate. To change the notes, fix the changesets on `next`, close the release PR, and request a new release.

## Merge and publish

A person merges the approved, green release PR under normal `next` protection. On merge, the `tag` job checks that the head is the bot's commit, the approval, and the candidate checks (plus the docs check for a stable release), then tags the head `sdk-release/<id>`. If the gate refuses the release it creates no tag and comments the fix on the PR: revert the release PR on `next`, then request the release again. Closing the release PR without merging abandons the release.

The tag run then:

1. Pins the candidate artifacts built on the release PR by ID and digest. It never rebuilds.
2. Uploads only the files npm and PyPI are missing. An existing file with identical bytes is accepted; different bytes stop the run with a conflict. npm versions are uploaded under a release-only dist-tag. Once every upload is visible and each tarball's provenance names `sdk.release.yml` at this release's tag and describes the reviewed bytes, the channel's tag (`latest` or `next`) moves forward and the release-only tag is removed. A failed provenance check leaves the channel tag where it was.
3. Checks what users get: `npm audit signatures` passes on a fresh install, each PyPI file is attested by `sdk.release.yml` in `pypi-release`, and `pypi-attestations` verifies the signature.
4. For a stable release, opens a docs PR that pins the released npm versions in `docs/package.json` and `docs/bun.lock`. Merging that PR after its checks pass is what makes twoslash type-check the docs against the released types.

The last job of each stage shows the outcome on the request issue, including failed and cancelled jobs.

## Recover a failed release

Open the tag run and choose **Re-run failed jobs**. A re-run publishes the same pinned files, skips files already published, and uploads the rest. This works while the candidate artifacts exist, 30 days from the candidate build.

If the artifacts expired, or a registry already serves different bytes, add changesets for the affected packages on `next` and request a new release. It plans from the versions in `next`, so the unpublished versions are skipped and the packages move to the next version.

## Verify a release yourself

Anyone can check that a published version came from this workflow:

```bash
# npm: registry signatures and provenance of an installed version
npm install @composio/core@0.29.0 && npm audit signatures
# PyPI: the PEP 740 attestation of a published file
uvx pypi-attestations verify pypi --repository https://github.com/ComposioHQ/composio \
  https://files.pythonhosted.org/.../composio-0.29.0-py3-none-any.whl
```

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
4. Register trusted publishers for `.github/workflows/sdk.release.yml` with the `npm-release` environment on every npm package, and with `pypi-release` on every PyPI package. Always set the environment: PyPI treats a publisher without one as matching any environment. On npm, enable **Allow npm dist-tag**, because the publish job moves `latest` or `next` and removes the release-only tag with `npm dist-tag`. Register shortly before the first release, because npm drops a new trusted publisher that hasn't published within 2 days. Keep the existing `ts.release.yml` and `py.release.yml` publishers. npm allows up to 10 trusted publishers per package and PyPI accepts several, so the `main` beta lane and core prereleases keep publishing.
5. Restrict pushes to `sdk-release/batch-*` branches to the App. The tag step refuses heads the App did not commit, so this only prevents confusion.
6. Keep Actions artifact retention at 30 days or more.

## CLI binaries and the 1.0 train

CLI binaries keep **Build CLI Binaries** and GitHub Releases. `@composio/cli` stays excluded from changesets. Follow the [CLI release skill](../../../.agents/skills/cli-release/references/release-workflow.md).

The 1.0 prerelease train on `main` keeps `ts.release.yml`, its prerelease state, the npm `beta` dist-tag and its trusted identity. `py.release.yml` keeps build-only dispatch and core prereleases. Betas of `next` use `sdk.release.yml` instead.
