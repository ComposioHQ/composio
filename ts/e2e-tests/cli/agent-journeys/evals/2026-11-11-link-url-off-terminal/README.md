# Print the authorization URL when `link` waits off a terminal

**Decision: kept.** This is a CLI fix, with one skill sentence, measured with the same journeys as the skill decisions.

## What the runs showed

After [the developer-project skill change](../2026-11-11-dev-playground-execute/README.md), Haiku chose the right tree on `developer-execute-unconnected` in every run and still passed none of them. Each run stopped at `composio dev connected-accounts link slack --no-browser`, which printed nothing while it waited: the URL went through terminal decoration (`ui.log.step`, `ui.note`), which `TerminalUI` drops when stderr is not a terminal. The agent had no URL to give the person, nobody approved, and the wait never ended. The wait was also longer than meant: `Schedule.max` of an exponential ramp and a 5-second spacing waits for the longer of the two, so fifteen checks took about 2 hours 44 minutes, and `composio login`'s hint promised 10 minutes.

## The change

- `connected-accounts.link.format.ts`: off a terminal, a `link` that waits writes the URL to stderr with `ui.error`, which survives redirection, followed by a hint for agents that names `--no-wait`. `--no-wait` keeps stderr quiet; its stdout JSON already carries the URL.
- `src/effects/authorization-poll.ts`: one schedule for `login` and `link`, a 0.3s ramp capped at one check every 5 seconds, for 10 minutes.
- `skills-src/composio-cli/index.ts`: the `link` section shows `--no-browser --no-wait` and says to give the user the `redirect_url` and wait for them.

## Results

Haiku, skill arm, train, 5 runs. Baseline: the kept `…-dev-playground-execute` batch of the previous decision. Same harness (`9ff7364caa93`); the CLI binary and the skill differ.

| journey                       | pass@1     | pass^5    | wrong tree |
| ----------------------------- | ---------- | --------- | ---------- |
| consumer-slack-message        | 80% → 100% | 0% → 100% | 0% → 0%    |
| developer-execute-unconnected | 0% → 100%  | 0% → 100% | 0% → 0%    |
| first-run-login               | 80% → 60%  | 0% → 0%   | 0% → 0%    |

- `developer-execute-unconnected` is what the change targets. All five runs linked with `composio dev connected-accounts link slack --no-browser --no-wait`, gave the person the `redirect_url`, and sent the message after the person's reply. None of them waited on `link`, so the gain comes from the skill sentence that teaches `--no-wait`, not from the URL now printed on stderr. That one is for an agent that still runs `link` without `--no-wait`, and it is checked by the handler tests and by `operations/process-streams.test.ts`, not by these runs.
- The two `first-run-login` failures are the failure seen before this change, at the same rate within noise: the agent says to open the login URL without writing it, so the person cannot approve and `composio login --poll` waits out the run's deadline. `login` was not changed apart from its wait now ending after 10 minutes.

Spend: $0.03.

## Repeat it

```sh
bun run eval.ts compare evals/2026-11-11-dev-playground-execute/2026-11-11T18-14-14-claude-code-claude-haiku-5-5-dev-playground-execute \
  evals/2026-11-11-link-url-off-terminal/2026-11-11T18-56-18-claude-code-claude-haiku-5-5-link-url-off-terminal
bun run eval.ts run --model claude-haiku-5-5 --runs 5 --arms skill --split train --label recheck
```
