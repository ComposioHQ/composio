# Baseline after the grader guards

The reference batch for every later decision about the `composio-cli` skill, measured on the harness that adds mutation and determinism guards ([#5418](https://github.com/ComposioHQ/composio/pull/5418)).

The journeys, checks, person and fake backend changed, and their hash is part of every batch, so no batch kept in `evals/2026-11-11-*` describes a run of the current harness: `compare` refuses to put them beside a new one. This directory holds the batch to compare against instead.

## What was run

```sh
cd ts/e2e-tests/cli/agent-journeys
set -a; . ~/.config/composio-e2e/llm.env; set +a
bun run eval.ts run --model claude-haiku-5-5 --runs 3 --arms skill,no-skill --label baseline
bun run eval.ts keep <batch> baseline-grader-guards
```

Claude Code 2.1.310, `claude-haiku-5-5`, 3 runs per journey and arm, 30 runs, $0.069. Revision `39f30ca19`, skill `25e724edfae2`, harness `edbcd56c3084`. The batch is `2026-11-16T17-52-05-claude-code-claude-haiku-5-5-baseline`.

| split   | arm      | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | -------- | ----------- | ----------- | --------------- |
| train   | skill    | 78%         | 33%         | 0%              |
| train   | no-skill | 67%         | 67%         | 0%              |
| holdout | skill    | 100%        | 100%        | 0%              |
| holdout | no-skill | 83%         | 50%         | 17%             |

## What this batch says, and what it does not

Nothing here is a decision. It is the line a future change is measured from, and it says what the harness sees with no change applied.

- **It does not say the skill helps or hurts.** Train `pass@1` favours the skill (78% against 67%) and train `pass^k` favours no-skill (67% against 33%), which is one run out of three either way. `HILLCLIMB.md` calls that noise, and three runs cannot separate it; a change that moves the train split by one run has not been shown to do anything.
- **Two train journeys pass 3/3 without the skill.** `consumer-slack-message` and `first-run-login` reach 3/3 in the no-skill arm, so that arm on its own cannot show the skill's worth; each passes 2/3 with the skill, so a skill change can still move them. `developer-execute-unconnected` shows the largest gap: 0/3 without the skill, 3/3 with it.
- **The two skill-arm failures have different causes.** `consumer-slack-message` loses one run of three with `stop: finished`: the model stopped after `composio link slack --no-wait` without sending, and five checks fail. `first-run-login` loses one run to the turn deadline with no login stored: four checks. `developer-execute-unconnected` no-skill never sends, and twice does not get a `playground-execute` to exit 0.
- **The wrong-tree rate in the holdout no-skill arm is one run** (33%), the one `developer-auth-configs-and-execute` run that failed five checks as well. With three runs a detour rate is a count, not a rate.

The mutation run in [#5418](https://github.com/ComposioHQ/composio/pull/5418) covers the other half of the same question: which steps of each hand-authored path the checks notice. 10 of 17 steps are `needed`, 7 are `unused` reads or commands that fail on purpose, and none is `check-too-weak`.

## To use it

```sh
bun run eval.ts run --model claude-haiku-5-5 --runs 3 --arms skill,no-skill --split train --label <change>
bun run eval.ts compare evals/baseline-grader-guards/2026-11-16T17-52-05-claude-code-claude-haiku-5-5-baseline <new batch>
```

`compare` refuses the two when a harness file changed since this batch. Measure a new baseline in that case, in the change that moves the harness, and keep it here.
