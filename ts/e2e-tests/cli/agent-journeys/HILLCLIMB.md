# Hill-climbing the composio skills

This is how to tell whether a change to the `composio-cli` skill (or to the CLI's help and error text) makes agents better at using the CLI, and how to iterate on it. It is written for a person or for a coding agent doing the iterating.

The replay suite (`e2e.test.ts`) is not the measure. It replays fixed model answers, so a skill change cannot move it. The measure is `eval.ts`: live, repeated runs of the journeys with the real agent, graded by the same checks.

## What a run is

One journey, one arm, one attempt:

- **Agent.** Claude Code 2.1.310, headless, in the journey container (`--agent claude-code`, the default). The skill is installed in `~/.claude/skills/composio-cli/`, among Claude Code's own skills, so the agent has to find it from its description, as a user's agent does. `--agent loop` instead gives the skill to the minimal loop as its system prompt: cheaper to reason about, but it measures only what the skill says, not whether it is found.
- **Arm.** `skill` installs the skill built from the working tree; `no-skill` installs nothing. The difference is what the skill is worth.
- **Model.** `claude-haiku-5-5` or `claude-opus-5-5`; the model proxy refuses any other.
- **Grade.** The journey's checks, which read what the fake backend recorded, never the agent's prose. A run passes when every check holds. Detours (a command on the wrong tree, a request to the wrong project) are counted apart and never fail a run.

## The numbers

For each journey and arm, over its graded runs:

| number     | meaning                                   | what to watch                                                  |
| ---------- | ----------------------------------------- | -------------------------------------------------------------- |
| pass@1     | share of runs that passed                 | the plain success rate, with a 95% interval                    |
| pass@k     | chance that at least one of k runs passes | whether the agent can do it at all                             |
| pass^k     | chance that all k runs pass               | whether a user can rely on it; the number to raise             |
| wrong tree | share of runs with at least one detour    | the root-tree / `composio dev` confusion this suite exists for |

Splits are averaged per journey, so a journey with more runs does not weigh more. `train` journeys are the ones changes are tuned against; `holdout` journeys only confirm.

## The loop

The key is loaded only into the command's environment:

```sh
cd ts/e2e-tests/cli/agent-journeys
set -a; . ~/.config/composio-e2e/llm.env; set +a
```

1. **Check the setup.** `bun run eval.ts run --model claude-haiku-5-5 --dry` prints the plan and spends nothing; `--smoke` runs one journey once.
2. **Measure the baseline.** Both arms, every journey, three runs each:
   `bun run eval.ts run --model claude-haiku-5-5 --runs 3 --arms skill,no-skill --label baseline`
3. **Read the failures.** `results/<batch>/summary.md` lists which checks failed how often. `results/<batch>/logs/<journey>.<arm>.<attempt>.json` has the commands, what they printed, what the agent wrote, the requests the fake received, and every Claude Code event. Find what the agent misunderstood before changing anything.
4. **Make one change.** Edit the skill's source in `ts/packages/cli/skills-src/composio-cli/`, or the CLI text the agent misread. Keep it to one idea, so a result can be attributed to it.
5. **Measure the train split.** `bun run eval.ts run --model claude-haiku-5-5 --runs 3 --split train --label <change>`, then
   `bun run eval.ts compare <baseline batch> <change batch>`.
6. **Decide.** Keep the change when the train split's mean pass^k rises and no train journey's pass@1 falls by more than one run. A difference of one run out of three is noise: when it decides the outcome, run both batches again with `--runs 5` (earlier runs with the same fingerprint are reused, so only the extra runs are paid for).
7. **Confirm.** Run the holdout split on the kept change and on the baseline, and the train split on `claude-opus-5-5`. A change that helps train and hurts holdout fits the journeys, not the agent: drop it.
8. **Record.** Results are git-ignored. Put the compare tables of a kept change in its pull request, with the batch ids.

## Rules

- **Do not change the harness in the same step as the skill.** The journeys, the checks, the person and the fake backend (`agent-journeys/src/`, `fake-backend/src/`) are what grade a run; their hash is part of every batch, and `compare` refuses two batches with different hashes. Fix a grader in its own change, then measure a new baseline.
- **Do not tune the checks to the agent.** A check that fails because the agent took a valid path the check did not foresee is a grader bug; fix it with a test in `journeys.test.ts`. A check that fails because the agent did the wrong thing is the signal.
- **Do not add the journeys' wording to the skill.** The skill is for every user's task; a sentence that only matches a journey's prompt raises train and nothing else.
- **Spend little.** A Haiku run costs about $0.002 to $0.01; Opus about 40 times that. `--max-cost-usd` (default $2) stops a batch from starting runs past it, and `--run-budget-usd` caps one run.

## Adding a journey

A journey that no agent fails cannot separate two skills, and one that every agent fails cannot either. Add one when a live run shows a failure no journey catches: the prompt a user would type, the state it starts from, checks on what the fake recorded, and a `split`. `journeys.test.ts` then checks that an agent doing nothing fails it.

## Limits

See "Measuring a change" in the [README](./README.md#measuring-a-change): outbound traffic is not blocked, requests of overlapping or background commands are attributed together, and five journeys are a thin train and holdout set. Two more:

- `composio login` installs the skill for real users, so a `no-skill` run that logs in may end with the skill installed. That is the product's behaviour, and it means `no-skill` measures "not installed at the start".
- Claude Code's own skills are present in both arms, as they are for a user.
