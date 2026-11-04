# Stable SDK releases

You can request a Python release, a TypeScript release, or both through one procedure. An eligible reviewer approves one release PR. Automation then publishes its frozen candidates and verifies packages and documentation.

## Request, approve, inspect, and retry

1. Open a GitHub issue using **SDK release request**. Every active ComposioHQ member can use the form, including members with repository Read access and private organization membership. Repository writers can instead run **SDK release** on `next` in Actions.
2. Leave each language at `auto` to use its Changesets recommendations. Choose `patch`, `minor`, `major`, or `skip` independently when you need an override. The release PR shows recommendations and selected versions. An explicit bump with no notes creates a maintenance release; empty `auto` returns “Nothing to release.”
3. Review the release PR's versions, notes, generated references, and candidate checks. One eligible non-author reviewer approves its final head. Editing or refreshing it requires fresh approval. The bot merges only the approved, green head under normal `next` protection.
4. Inspect the request and release PR's publication status. It links the original run, approved source, candidate receipts, and partial registry inventory. Completion means exact package versions and live release docs have verified.
5. To recover, submit the same form with `retry` and the original run ID. New bump choices are ignored. After package verification, the same action retries docs only, without uploading packages or accessing registry OIDC.

An active publication returns its existing status instead of allocating competing versions. Normal code PRs can continue. Later SDK changes stay pending for the next release; they aren't added to an already approved source.

## Add an incremental release note

Run from the repository root:

```bash
pnpm changeset
```

Select every affected published TypeScript package and/or the private `@composio/python-sdk` marker. The marker versions the Python core and all supported providers together; it is never published to npm. TypeScript core and slim move together, while providers keep independent versions.

You can write one fragment for both languages:

```markdown
---
"@composio/core": minor
"@composio/python-sdk": patch
---

Describe the public behavior and any migration steps.
```

Choose a patch, minor, or major recommendation for each entry. Put prose types such as `Array<Tool>` in code spans because summaries become MDX. Docs-only, tests-only, internal tooling, and CLI-only changes do not need an SDK note. If a source change doesn't affect public behavior, explain it with `<!-- sdk-release-note-exempt: explain why public SDK behavior is unchanged -->` (at least 20 characters in the reason) in the PR body.

## Recovery limits

Publisher retries reuse the original selected versions and exact candidate bytes. Before accepting an existing npm tarball or Python wheel/sdist, the workflow checks its downloaded bytes against the original candidate. Missing files are uploaded; conflicting files end recovery. npm provenance, stable tags, Python metadata, and fresh installs are verified separately.

Recovery ends at the earliest of 30 days from the original publication run, original artifact deletion/expiry, or GitHub's 50-attempt limit. A possible earlier upload prevents rebuilding a missing candidate for the same version. Request a new higher-version corrective release with normal approval when recovery ends. Its plan reconciles the recorded partial inventory; published files are never removed or replaced.

Docs failure reports “Packages published; docs pending” and allows the next release. Docs-only recovery continues after candidates expire. It asks the existing Vercel Git integration to rebuild current protected `next`, then checks the original release's live HTML and Markdown version table and current representative references. It never deploys an old whole-site snapshot. A missing deploy hook is a visible recovery failure.

## Documentation ownership

The release PR contains normal committed changelog entries, exact version tables, and selected API references generated from frozen SDK inputs. Entries link to neutral publication status and may appear at merge before packages finish publishing. Historical changelogs use the existing no-Twoslash preset; maintained guides keep their normal checks.

SDK-marked entries bypass merge-time success notifications and the generic changelog guide updater. After registry verification, one serialized maintenance PR updates existing docs SDK pins to exact verified versions and reviews affected guides. Its source is current protected docs plus preserved pending guide edits. It rechecks source, verified release, and maintenance branch before writing, refuses pin decreases, and skips or requires regeneration when inputs change. It is independently reviewed and does not gate package publication or release completion.

Vercel deployment, Markdown, Algolia, and content freshness retain their normal paths. **Docs - Sync Algolia Search** fails if credentials are missing or indexing fails; package completion does not imply indexing succeeded. Retry that maintenance workflow after fixing its configuration. CLI guide maintenance and ordinary changelog notifications keep their existing paths.

## Owner bootstrap and acceptance

Complete these hosted prerequisites before enabling the final stable publisher. Local tests do not establish them.

1. Merge the cache fix and guarded request pilot first. With the dedicated App, exercise a real private-membership member with repository Read access, an outsider, a membership lookup failure, three overlapping requests, an App-created downstream check run, and an original failed-job retry. Each member request must receive status; rejected membership must cause no release writes.
2. Install a dedicated SDK release App with repository Contents, Pull requests, Issues, and Actions write, plus organization Members read. It needs no Administration permission or protection bypass on `next`. Set public `SDK_RELEASE_APP_ID`, `SDK_RELEASE_APP_SLUG`, and `SDK_RELEASE_APP_CLIENT_ID` variables. Put `SDK_RELEASE_APP_PRIVATE_KEY` only in `sdk-release-control`, restricted to protected `next`, without reviewers. Do not copy the key to repository secrets or a legacy environment.
3. Protect `sdk-release/*` source tags against creation, update, and deletion, with only this SDK App allowed to bypass. Test that an ordinary writer and the legacy App cannot create or move a controlled tag. Preserve unrelated CLI and beta tag rules.
4. Create separate `npm-release` and `pypi-release` environments without reviewers, wait timers, or custom approvals. Allow selected **Tag** deployments only for `sdk-release/*`, with no branch deployment policy. Do not weaken the existing `pypi` environment.
5. Register exact repository/workflow/environment trusted publisher identities for `.github/workflows/sdk.release.yml` on every in-scope npm and PyPI package. Enable npm direct publication and dist-tag operations for the new identity. Keep the shared `main` beta `ts.release.yml` identity; do not replace it. Verify new identities through the first controlled release.
6. In the existing production Vercel docs project, create a native deploy hook bound to this repository's protected `next` branch. Store its URL as `VERCEL_DOCS_NEXT_DEPLOY_HOOK` only in `sdk-release-control`. Verify the hook rebuilds current `next` and keeps the normal production build, Markdown, and deployment integration. See [Vercel deploy hooks](https://vercel.com/docs/deploy-hooks).
7. Confirm the repository retains Actions artifacts for at least 30 days. Run the owner policy preflight from the reviewed final code with an existing owner credential:

   ```bash
   SDK_POLICY_TOKEN="$OWNER_GITHUB_TOKEN" SDK_RELEASE_APP_ID="$SDK_APP_ID" \
     bun scripts/sdk-release/registry.ts check-policy
   ```

   GitHub hides full ruleset bypass actors from callers without ruleset write access. This owner-only check verifies those actors; runtime checks use public active rules, exact App identity, approved source, and tag/environment bindings. Do not give publishers Administration merely to inspect the hidden list.

## Stable cutover checklist

Run this checklist as an explicitly authorized hosted rollout, before merging the final activation PR.

1. Inspect running, queued, and waiting legacy `ts.release.yml` and `py.release.yml` runs. Cancel or drain every stable `next` publisher and confirm it is terminal. Until the activation PR merges, do not merge a stable Version Packages PR or push a stable `py@*` tag. A workflow edit does not stop runs already queued. Preserve `main` beta runs and core prereleases.
2. Inspect `changeset-release/next` and its generated PR. Save useful authored notes and check its commits for unique work before closing that PR or deleting its known bot branch. Inspect the known `docs/auto-update-ts-sdk-reference` and `docs/auto-update-python-sdk-reference` branches/PRs the same way; preserve useful edits, then close or regenerate them through the coordinator. Do not close unrelated human PRs or delete generic matching branches.
3. Re-audit stable package baselines and pending notes. Confirm the real Python marker and fragment policy activate in the same revision that retires stable-next legacy publishers and raw-source reference PR generation. The final `ts.release.yml` serves `main` only; `py.release.yml` retains build-only dispatch and core-prerelease publication. Preserve actual `main` beta metadata, `.changeset/pre.json`, CLI binary workflows, and shared beta trust.
4. After bootstrap, policy, pilot, drain, and note-preservation evidence pass, merge the final activation PR normally. Do not disable whole workflows, delete legacy secrets, or migrate beta publication as part of this stable cutover.
5. Run one controlled member-requested release. Verify exact approved-head/tag/event/provenance identity, both selected language candidates before upload, original candidate retention, public registry contents, fresh npm/Python consumers, and live HTML/Markdown version rows and representative reference pages. Exercise a failed-job retry and a docs-only retry. Record distinct receipts and timings.
6. Ask a colleague to complete request, approve, inspect, and retry using this short runbook. Retire a next-only legacy PyPI identity only after the replacement works and an owner confirms no remaining use. Preserve shared beta trust.

Record setup time separately from build and approval time. The cache change's observed hosted setup was 8 seconds against the previous 493 seconds. Measure warm merge-to-registry time on the controlled release; a local build or pilot is not evidence of registry timing.

## CLI binaries and beta SDKs

CLI binaries keep **Build CLI Binaries** and GitHub Releases. Merges to `next` build rolling CLI betas; stable promotion runs at an existing tested beta tag. `@composio/cli` remains excluded from Changesets. Follow the [CLI release skill](../../../.agents/skills/cli-release/references/release-workflow.md) for exact commands and artifact/install verification.

The `main` SDK beta lane keeps its existing workflow, prerelease state, versions, and trusted identities. This stable migration does not merge `next` versions into `main` or alter beta metadata.
