# Dependabot remediation plans

Generated from live GitHub state and `origin/next` on 2026-08-03. The audit
covered all eight open Dependabot pull requests and all 25 dependency updates
named by them. Execute each plan from a fresh branch based on the then-current
`origin/next`; never reuse a stale Dependabot lockfile.

## Audit result

All eight pull requests are Git-mergeable and review-blocked. Mergeability is
not approval: four heads have substantive failed checks, two green heads need
only a fresh base and rerun, and two green or partially green heads do not prove
the proposed compatibility change.

| PR                                                                                                                          | Packages                                             | Live result                                                                             | Disposition                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [#4001](https://github.com/ComposioHQ/composio/pull/4001) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4001)) | `actions/stale` 10.4.0 to 11.0.0                     | 10 checks, no failures; scheduled action itself did not run                             | Refresh and approve through Plan 001                                                   |
| [#4002](https://github.com/ComposioHQ/composio/pull/4002) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4002)) | 12 npm production updates                            | Examples fail on incompatible AI SDK internal types                                     | Supersede through Plan 004                                                             |
| [#4003](https://github.com/ComposioHQ/composio/pull/4003) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4003)) | 7 npm development updates                            | 22 checks, no failures                                                                  | Refresh and approve through Plan 002                                                   |
| [#4004](https://github.com/ComposioHQ/composio/pull/4004) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4004)) | `@effect/printer-ansi` 0.50.0 to 1.0.0               | Unit and CLI E2E fail; 1.0.0 belongs to an obsolete Effect generation                   | Close and supersede through Plan 003                                                   |
| [#4005](https://github.com/ComposioHQ/composio/pull/4005) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4005)) | `openai` 6.49.0 to 7.x on current `next`             | Build is green, but tests, typecheck, examples, peer checks, and changesets did not run | Supersede through Plan 005                                                             |
| [#4006](https://github.com/ComposioHQ/composio/pull/4006) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4006)) | six explicit AI SDK 6 compatibility pins to AI SDK 7 | 11 jobs fail at frozen install because the lockfile was omitted                         | Close; Plan 004 advances the AI SDK 7 catalog while retaining this intentional v6 lane |
| [#4007](https://github.com/ComposioHQ/composio/pull/4007) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4007)) | `tomli` 2.0.x to `<2.5`                              | Green, but CrewAI still forces the lock to 2.0.2                                        | Close; Plan 007 is blocked on CrewAI relaxing its requirement                          |
| [#4008](https://github.com/ComposioHQ/composio/pull/4008) ([Glen](https://app.tryglen.com/review/ComposioHQ/composio/4008)) | `ag2` 0.x to 1.x                                     | Python 3.10 import fails; 3.11 and 3.12 were cancelled                                  | Supersede with an AG2 v1 provider migration through Plan 006                           |

## Package inventory

Plan 004 covers the 12 production-group packages: `@anthropic-ai/claude-agent-sdk`,
`@ai-sdk/mcp`, `@anthropic-ai/sdk`, `langchain`, `@openai/agents`,
`@langchain/anthropic`, `typebox`, `@ai-sdk/openai`,
`@cloudflare/workers-types`, `@mastra/core`, `@modelcontextprotocol/sdk`, and
`hono`. It also advances the existing AI SDK 7 catalog dependency in lockstep
with the two `@ai-sdk/*` packages.

Plan 002 covers the seven development-group packages: `@types/node`, `oxlint`,
`oxlint-plugin-eslint`, `turbo`, `tar`, `@earendil-works/pi-coding-agent`, and
`eve`. Plans 001, 003, 005, 006, and 007 cover `actions/stale`, the coordinated
Effect family, `openai`, AG2 v1, and Tomli respectively.

## Execution order and status

| Plan | Title                                                                                 | Priority | Effort | Depends on               | Status                                              |
| ---- | ------------------------------------------------------------------------------------- | -------- | ------ | ------------------------ | --------------------------------------------------- |
| 001  | [Refresh `actions/stale` safely](./001-refresh-actions-stale.md)                      | P2       | S      | none                     | IN PROGRESS — local gates complete; CI pending      |
| 002  | [Refresh development tooling](./002-refresh-development-tooling.md)                   | P2       | S      | none                     | IN PROGRESS — local gates complete; CI pending      |
| 003  | [Align the Effect CLI family](./003-align-effect-cli-family.md)                       | P1       | M      | none                     | IN PROGRESS — local gates complete; CI pending      |
| 004  | [Rebuild the npm production rollup](./004-rebuild-npm-production-rollup.md)           | P1       | M      | none                     | IN PROGRESS — local gates complete; CI pending      |
| 005  | [Migrate published OpenAI consumers to v7](./005-migrate-openai-v7.md)                | P1       | M      | none                     | IN PROGRESS — local gates complete; CI pending      |
| 006  | [Migrate the AutoGen provider to AG2 v1](./006-migrate-autogen-provider-to-ag2-v1.md) | P1       | M      | none                     | TODO                                                |
| 007  | [Upgrade Tomli after CrewAI permits it](./007-upgrade-tomli-after-crewai.md)          | P3       | S      | upstream CrewAI metadata | BLOCKED — CrewAI 1.15.10 still requires Tomli 2.0.x |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`, or `REJECTED`.

## Landing strategy

- Plans 001 and 002 may share one low-risk rollup PR, with one conventional
  commit per plan.
- Plans 003, 004, 005, and 006 should use separate PRs because each has a
  distinct compatibility contract and rollback boundary.
- Every TypeScript plan must generate `pnpm-lock.yaml` through pnpm and prove a
  frozen install. Never copy the lockfile from an old Dependabot head.
- Do not run the stale workflow manually: its production dispatch can relabel
  or close issues and pull requests.

## Findings considered and rejected

- Merging #4004 and adding an import patch was rejected. The proposed 1.0.0
  package is from the wrong Effect generation; the maintained coordinated line
  is 0.51.x.
- Merging #4006 after merely regenerating the lockfile was rejected. The six
  explicit AI SDK 6 pins provide Mastra and Zod compatibility coverage; the
  normal catalog already exercises AI SDK 7.
- Merging #4007 was rejected. Widening the direct Tomli range does not change
  the resolved version while CrewAI requires `tomli~=2.0.2`.
- Replacing AG2 with the Classic `autogen` distribution was rejected. AG2 1.x is
  the maintained forward line; the dependency update needs a provider/API
  migration because it no longer provides the old `autogen` import path.
