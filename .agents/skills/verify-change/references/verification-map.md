# Verification Map

The maintained argv and working directories are in `scripts/agent-profiles.json`.
Run from the repository root with its pinned mise toolchain, Bun and the normal
or Python development environment prepared. Profiles run existing checks and
their normal environment setup (including nox environment creation); they do not
choose a model.

The CLI and TypeScript SDK profiles use package-scoped Turbo tasks so prerequisite
workspace builds run before tests and type checks, including in a fresh checkout.

| Profile            | Existing checks                                                                       | What remains outside its proof                                          |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `workflow`         | Bun task integration tests, their TypeScript check and both agent-guidance validators | Agent judgment, product behavior, hosted CI                             |
| `cli`              | CLI package tests, boundary validators and TypeScript checks                          | Built-binary behavior, real backend behavior                            |
| `sdk-typescript`   | Core SDK unit tests and type checks                                                   | Changed providers, runtime packaging, live API behavior                 |
| `sdk-python`       | Existing `make chk` and `make tst` nox sessions in `python/`                          | Built artifacts, live API behavior, providers outside those sessions    |
| `release-metadata` | Existing release-workflow checks                                                      | Hosted checks, merges, tags, registries and clean consumer installation |

Use the package skills for narrower tests or additional affected providers. For
packaging or runtime changes, use existing Node/Cloudflare or CLI Docker E2E
checks after reading `typescript-testing` or `cli-e2e`. For publication, follow
`cli-release` or `python-release`; a local receipt never establishes publication.

## Carry a task between sessions

The TypeScript CLI runs with Bun and uses `effect/cli` for argument validation and
generated help. Start with `bun run agent:task --help` or
`bun run agent:task init --help` to inspect commands and required flags.
Task commands print JSON; verification streams check output to stderr.

```sh
bun run agent:task init cli-output --goal "Reproduce the reported CLI output bug and verify the fix" --profile cli --source https://github.com/ComposioHQ/composio/issues/123 --authority "Implement locally; publication requires the current request"
bun run agent:task status cli-output
bun run agent:task verify cli-output
bun run agent:task list
```

The id names `.artifacts/agent-tasks/<id>/task.json`. Update its `nextStep` and
`blocker` fields as work progresses. Keep the goal observable; record the real
source issue or PR URL when one exists. The authority field preserves context;
it is never permission to exceed the current user request or repository rules.

Receipts retain the task, profile, source-content fingerprint and exact HEAD at
verification time. A changed task acceptance contract, tracked or untracked source file, or profile
makes previous passing evidence stale. Ignored artifacts are excluded, so a
receipt does not cover ignored binaries or environment state changing later.
Fresh external observations are still required for production and registry claims.
Changing only `nextStep` or `blocker` preserves verification evidence.

Each attempt has its own receipt and a private output log capped at 64 KiB. Failed
attempts survive subsequent success. Missing tools, failed commands, interruption
and source edits during verification cannot produce a passing attempt. Remaining
commands after the first failure were not run. An abruptly killed runner reads as
interrupted, including when its latest attempt has no finished receipt. A retry
recovers a dead runner's lock once its old command group is gone. If that group
remains alive, the error identifies the group and receipt to inspect and stop
before retrying. Live-runner locks are never recovered automatically.

Verification is serialized per worktree because profiles share build and nox outputs.
Use separate worktrees for parallel tasks. An interrupted lock acquisition can leave
`.artifacts/agent-tasks/acquire.lock`; inspect its PID and remove it only after
confirming that process has ended.

## Learn from interventions

`test/agent-task.test.ts` turns concrete workflow failure classes into runnable
checks: context survives resumption; edits invalidate proof; failures preserve
evidence; missing tools fail rather than skip. These exercise the tool's behavior,
not an LLM's planning quality. For a new recurring mistake, add the smallest
behavioral check at the real failure boundary and demonstrate its failure before
the fix. Keep unrelated passing cases as retention checks. Assess judgment-heavy
changes on new tasks before claiming they reduce supervision.
