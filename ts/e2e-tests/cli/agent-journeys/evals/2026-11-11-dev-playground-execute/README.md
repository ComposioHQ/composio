# Teach `composio dev playground-execute` for developer projects

**Decision: kept.** On developer tasks the skill sent agents to the root `composio execute`, which acts on the consumer project. The developer reference now says how a tool runs inside a developer project.

## What the runs showed

Baseline, Claude Code 2.1.310 with `claude-haiku-5-5`, 5 runs per journey and arm (`…-haiku-5-5-baseline`):

- `developer-auth-configs-and-execute`: 3/5 with the skill, 5/5 without it. Every run with the skill took the root tree (wrong tree 100%).
- `developer-execute-unconnected`: 0/5 with the skill, wrong tree 100%.

The transcripts show the cause. The agent loads the skill, opens `references/composio-dev.md`, runs `composio dev auth-configs list` correctly, then runs the tool with `composio execute`. The reference never named `composio dev playground-execute`; its only words on executing were "if the user only wants to connect and execute tools as an end user, return to the top-level workflow", and the skill's first step is "start with `composio execute`".

## The change

`ts/packages/cli/skills-src/composio-cli/`:

- `references/composio-dev.ts`: a new section, "Run Tools In A Developer Project". It says that root `execute` and `link` act on your own account in the consumer project, names `composio dev playground-execute` (same `-d`, `--get-schema`, `--dry-run`), and names `composio dev connected-accounts link <toolkit>` for a missing connection. The examples use Gmail, not the journeys' Slack. The closing sentence now reads "act on their own account rather than in a developer project".
- `index.ts`: one sentence after the pointer to the reference: "In a developer project, run tools with `composio dev playground-execute`, not `composio execute`."

## Results

Skill arm, baseline → change. Same harness (`9ff7364caa93`), skill `72d9d691700d` → `f6f4d7820d90`.

Haiku, train (`…-dev-playground-execute`):

| journey                       | pass@1    | pass^5  | wrong tree |
| ----------------------------- | --------- | ------- | ---------- |
| consumer-slack-message        | 40% → 80% | 0% → 0% | 0% → 0%    |
| developer-execute-unconnected | 0% → 0%   | 0% → 0% | 100% → 0%  |
| first-run-login               | 40% → 80% | 0% → 0% | 0% → 0%    |

Haiku, holdout (`…-dev-playground-execute-holdout`):

| journey                            | pass@1      | pass^5      | wrong tree |
| ---------------------------------- | ----------- | ----------- | ---------- |
| developer-auth-configs-and-execute | 60% → 100%  | 0% → 100%   | 100% → 0%  |
| run-inline-script                  | 100% → 100% | 100% → 100% | 0% → 0%    |

Opus, the two developer journeys, 3 runs each (`…-opus-baseline` → `…-opus-dev-playground-execute`):

| journey                            | pass@1      | pass^3      | mean cost       |
| ---------------------------------- | ----------- | ----------- | --------------- |
| developer-execute-unconnected      | 0% → 100%   | 0% → 100%   | $0.084 → $0.079 |
| developer-auth-configs-and-execute | 100% → 100% | 100% → 100% | $0.118 → $0.049 |

Reading them:

- The wrong-tree rate on the developer journeys went from 100% to 0% for Haiku, in train and in holdout. This is what the change targets.
- Haiku still fails `developer-execute-unconnected` after the change, now on the right tree: `composio dev connected-accounts link slack --no-browser` prints nothing while it waits, so the agent has no URL to give the person. That is a CLI bug (the URL goes through terminal decoration that is dropped off a TTY), not a skill problem. Opus got past it with `--no-browser --no-wait`.
- The +40 on `consumer-slack-message` and `first-run-login` is 2/5 → 4/5, inside the 95% intervals of both batches. The change does not touch those paths; treat it as noise.
- Opus did not take the wrong tree before the change either; with it, Opus finds the developer path in fewer commands (two instead of three to six on `developer-auth-configs-and-execute`).

Spend: $0.12 (Haiku baseline, both arms), $0.06 (Haiku with the change, both splits), $0.99 (Opus, both sides).

## Repeat it

From `ts/e2e-tests/cli/agent-journeys`, with the key loaded (see [HILLCLIMB.md](../../HILLCLIMB.md)):

```sh
# The kept comparisons
bun run eval.ts compare evals/2026-11-11-dev-playground-execute/2026-11-11T17-53-36-claude-code-claude-haiku-5-5-baseline \
  evals/2026-11-11-dev-playground-execute/2026-11-11T18-14-14-claude-code-claude-haiku-5-5-dev-playground-execute
bun run eval.ts compare evals/2026-11-11-dev-playground-execute/2026-11-11T17-53-36-claude-code-claude-haiku-5-5-baseline \
  evals/2026-11-11-dev-playground-execute/2026-11-11T18-24-23-claude-code-claude-haiku-5-5-dev-playground-execute-holdout

# Measure the current checkout against the kept result
bun run eval.ts run --model claude-haiku-5-5 --runs 5 --arms skill --label recheck
bun run eval.ts compare evals/2026-11-11-dev-playground-execute/2026-11-11T18-14-14-claude-code-claude-haiku-5-5-dev-playground-execute <new batch id>
```

The baseline batches ran with the skill source at the parent of the commit that made this change.
