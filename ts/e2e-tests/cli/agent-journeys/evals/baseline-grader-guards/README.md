# Baseline after the grader guards

The reference batch for every later decision about the `composio-cli` skill, measured on the harness that adds mutation and determinism guards ([#5418](https://github.com/ComposioHQ/composio/pull/5418)).

The journeys, checks, person and fake backend changed, and their hash is part of every batch, so no batch kept in `evals/2026-11-11-*` describes a run of the current harness: `compare` refuses to put them beside a new one. This directory holds the batch to compare against instead.

## What was run

```sh
cd ts/e2e-tests/cli/agent-journeys
set -a; . ~/.config/composio-e2e/llm.env; set +a
bun run eval.ts run --model claude-haiku-5-5 --runs 5 --arms skill,no-skill --force --label baseline
bun run eval.ts keep <batch> baseline-grader-guards
```

Claude Code 2.1.310, `claude-haiku-5-5`, 5 runs per journey and arm, 50 runs, $0.096. Harness `edbcd56c3084`, skill `25e724edfae2`, CLI `6710a5ed`; the batch records `dirty: false`. `--force` reused no earlier run. The batch is `2026-11-16T18-57-32-claude-code-claude-haiku-5-5-baseline`.

| split   | journey                            | arm      | passed | pass@1          | pass^k | wrong tree |
| ------- | ---------------------------------- | -------- | ------ | --------------- | ------ | ---------- |
| train   | consumer-slack-message             | no-skill | 0/5    | 0% (0%–43%)     | 0%     | 0%         |
| train   | consumer-slack-message             | skill    | 5/5    | 100% (57%–100%) | 100%   | 0%         |
| train   | developer-execute-unconnected      | no-skill | 1/5    | 20% (4%–62%)    | 0%     | 0%         |
| train   | developer-execute-unconnected      | skill    | 5/5    | 100% (57%–100%) | 100%   | 0%         |
| train   | first-run-login                    | no-skill | 3/5    | 60% (23%–88%)   | 0%     | 0%         |
| train   | first-run-login                    | skill    | 2/5    | 40% (12%–77%)   | 0%     | 0%         |
| holdout | developer-auth-configs-and-execute | no-skill | 5/5    | 100% (57%–100%) | 100%   | 20%        |
| holdout | developer-auth-configs-and-execute | skill    | 5/5    | 100% (57%–100%) | 100%   | 0%         |
| holdout | run-inline-script                  | no-skill | 5/5    | 100% (57%–100%) | 100%   | 0%         |
| holdout | run-inline-script                  | skill    | 5/5    | 100% (57%–100%) | 100%   | 0%         |

| split   | arm      | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | -------- | ----------- | ----------- | --------------- |
| train   | skill    | 80%         | 67%         | 0%              |
| train   | no-skill | 27%         | 0%          | 0%              |
| holdout | skill    | 100%        | 100%        | 0%              |
| holdout | no-skill | 100%        | 100%        | 10%             |

## What this batch says

- **The train split separates the arms.** 80% pass@1 and 67% pass^k with the skill, against 27% and 0% without it. That is the first batch in `evals/` where a train arm reaches 5/5 on a journey the other arm cannot do at all.
- **`consumer-slack-message` shows the mechanism, not just the gap.** With the skill, 5/5 runs ran `composio` and sent the message, in 5 to 10 model turns. Without it, 0/5: every run spent its one or two commands on `env | grep -i slack` or `which slack`, concluded there was no Slack tool here, and stopped. None of the five ran `composio` at all. The skill's worth on this journey is the sentence that names the CLI.
- **`first-run-login` is the exception and is partly a timeout rate.** 2/5 with the skill against 3/5 without it. Three of the five skill runs and two of the five no-skill runs ended at the six-minute wall-clock deadline before reporting a turn (`stop: deadline`, no model turns), which the checks record as four failures: no login session, no key, no stored login, and the model not finishing by itself. Only the other runs graded how the agent logged in.
- **The holdout split cannot separate the arms.** Both arms are 5/5 on both journeys. The one wrong-tree count is a single no-skill run of `developer-auth-configs-and-execute` that took two detours on its way and still passed every check, so the rate is a count of one.
- **The no-skill arm did not behave the same way in the batch before this one.** That batch (`2026-11-16T17-52-05-…`, 3 runs) records the same `agentVersion`, `model`, `skillSha256`, `harnessSha256` and `cliSha256`, and `dirty: false`, yet `consumer-slack-message` no-skill passed 3/3 there: each of its runs ran `composio --help` on its own and sent the message. Here it is 0/5. Nothing the batch records differs, so the difference is model behaviour the batch does not capture. Treat a rate from fewer than five runs as provisional, and re-run the baseline next to a change rather than comparing against one batch.

## What it does not say

Nothing here is a decision about the skill. It measures one model: `claude-haiku-5-5` at Claude Code 2.1.310, on the train and holdout journeys as they are now. `claude-opus-5-5` is not measured here; `HILLCLIMB.md` uses it to confirm a change that the train split already supports, which needs a baseline of its own first. The mutation run in [#5418](https://github.com/ComposioHQ/composio/pull/5418) covers the other half of the same question, which steps of each hand-authored path the checks notice: 10 of 17 are `needed`, 7 are `unused` reads or commands that fail on purpose, and none is `check-too-weak`.

## To use it

```sh
bun run eval.ts run --model claude-haiku-5-5 --runs 5 --arms skill,no-skill --split train --label <change>
bun run eval.ts compare evals/baseline-grader-guards/2026-11-16T18-57-32-claude-code-claude-haiku-5-5-baseline <new batch>
```

`compare` refuses the two when a harness file changed since this batch. Measure a new baseline in that case, in the change that moves the harness, and keep it here.
