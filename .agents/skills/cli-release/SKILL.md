---
name: cli-release
description: Release and recover first-party Composio CLI binaries through Build CLI Binaries, including automatic beta builds, promote-stable dispatches, beta-tag selection, asset and installation verification, and failed release recovery. Use when a contributor asks to build a CLI beta, publish or promote a stable CLI version, choose a release candidate, monitor a CLI release, or diagnose a failed CLI release. Do not use for TypeScript SDK Changesets releases or CLI source implementation.
---

# CLI Release

Use this skill for the GitHub Release that powers the standalone `composio` binary and installer.

Read `references/release-workflow.md` before selecting a candidate or dispatching a workflow.

## Release Contract

- Never add a Changeset for `@composio/cli` or `@composio/cli-local-tools`; both packages are ignored by Changesets and such files wedge `ts.release.yml`.
- Treat a merge to `next` that touches CLI paths as a beta build. Promote a tested beta with the `promote-stable` workflow action for the normal stable-release path.
- Treat a direct CLI `package.json` version bump as a release-owner-only recovery path, not the contributor default.
- Resolve beta tags and workflow state from GitHub immediately before acting. Never invent or reuse a stale candidate from memory.
- A stable promotion is a production write. If the user did not name the exact beta tag, present the resolved candidate and obtain explicit confirmation before dispatching it.
- Follow the release through asset verification, installation tests, and the Homebrew tap update. Do not stop after the dispatch succeeds.

## Execution

1. Classify the request as automatic beta, manual beta, stable promotion, or recovery.
2. Run the playbook's read-only preflight and identify the exact source commit and release tag.
3. Dispatch only the requested workflow action and watch the resulting run to completion.
4. Verify the published release and downstream checks named in the playbook.
5. Report the released tag, source beta or commit, workflow URL, asset state, install-test result, and any remaining follow-up.
