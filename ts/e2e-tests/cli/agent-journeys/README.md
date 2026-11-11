# CLI agent journeys

A journey is a task given to a model that has one tool, a shell, and one piece of guidance, the `composio-cli` skill. The model's commands run against the real `composio` binary in a journey container; the binary talks to the fake backend in [`../fake-backend`](../fake-backend/README.md); the model itself is replayed by [aimock](https://github.com/CopilotKit/aimock) from a fixture file.

```bash
pnpm --filter @e2e-tests/cli-agent-journeys test:e2e:cli
```

No API key is read and no model is called when the tests run.

## What a passing journey proves

Read this before drawing a conclusion from a green run.

- **Hand-authored fixtures** (`*.openai.hand-authored.json`) prove that _the path the skill teaches works against the binary_. Nobody's model chose those commands. They do not show that a real model follows the skill.
- **Recorded fixtures** (`*.anthropic.<model>.json`) prove that _this model, given the skill and the prompt, once took this path, and the path still works against the binary_. One recording is one sample, not a rate.
- Neither kind proves anything about the real backend. See the fake's fidelity section.

A replay on its own proves nothing: aimock answers the same whether a command succeeded or failed. So every journey is judged by its checks (`src/journeys.ts`), which read the commands that ran, their exit codes and output, and the fake backend's journal: which tool ran, on which project, as which user. None of them reads the model's prose.

## How a run works

1. `src/skill.ts` renders the skill from `ts/packages/cli/skills-src/composio-cli`, so a change to the skill changes the system prompt here. The system prompt is the built `SKILL.md` preceded by one line naming the directory where the skill's files are in the container, as an agent host does; the references are written there for the model to `cat`.
2. `src/agent.ts` is the loop: ask the model, run each `shell` call in the container, hand back `{"exit_code", "stdout", "stderr"}`, repeat, for at most 12 model turns. It adds no prompt of its own. When the model stops to wait for the person, the person may answer, and the loop goes on.
3. `src/scrub.ts` makes output repeatable before the model sees it: the fake's per-run URLs become `https://backend.composio.test` and `https://dashboard.composio.test`, temporary directories and wall-clock timestamps are replaced, long output keeps its head and tail.
4. `src/person.ts` is the person the agent works for. See [The person](#the-person).
5. Two adapters speak the wire formats through the official SDKs: `src/anthropic-adapter.ts` (Messages) and `src/openai-adapter.ts` (Chat Completions). Both send a placeholder key to the local aimock.

aimock runs in strict mode with exactly one fixture file loaded: one file per journey, provider, and model. A request the file does not answer gets a 503 and fails the test, and the suite also asserts that every fixture in the file was served exactly once.

## The person

A login or an account authorization needs the account's owner in a browser. No agent can approve it for them, so a journey that needs one has to model what reaches the person. If the model approved everything, an agent that never showed anyone the URL would pass.

Two things reach this person:

- a page the CLI opens in their browser (the container has an `xdg-open` that loads the page, and on the fake backend loading an authorization page approves it);
- what the agent writes to them.

They do not read the output of the agent's commands. The CLI assumes the same: off a terminal `composio login` prints "For agents: Show the URL above to the user".

They approve every authorization that reaches them. When the agent has stopped to wait for that approval, they answer `Done, I approved it in my browser. Please continue.`, and the agent gets another turn. So handing the person the URL and stopping is a correct move, not a failure: the journey goes on, and its checks are the same as for an agent that waited.

What follows from this model:

- `composio link <toolkit>` opens the browser and waits: approved while it waits.
- `composio link <toolkit> --no-wait` prints the URL and returns: approved once the agent shows the URL to the person.
- `composio link <toolkit> --no-browser` waits without opening anything, and off a terminal prints nothing until the account is active. Nothing reaches the person, so it times out. The real CLI behaves the same; `../operations` pins it as an expected failure.

Not modelled: a machine with no browser, a person who reads the agent's command output, a person who declines or is slow, and a person who approves the wrong account.

## Journeys

| Id                                   | Task                                           | Starts from                                         |
| ------------------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| `consumer-slack-message`             | Send a Slack message                           | Logged in, Slack not connected                      |
| `developer-auth-configs-and-execute` | List auth configs, run a tool as the test user | Logged in, developer directory, test user connected |
| `developer-execute-unconnected`      | Run a tool as the test user                    | Logged in, developer directory, nothing connected   |
| `first-run-login`                    | Find out whether the CLI is logged in; log in  | Empty home                                          |
| `run-inline-script`                  | Send a message from one `composio run` script  | Logged in, Slack connected                          |

`developer-execute-unconnected` is the tree-confusion case. Its hand-authored fixture scripts a model that first uses the root tree's word on the dev tree (`composio dev execute`), recovers from the parse error, then follows the CLI's not-connected hint, which names the dev-tree link. Its `scriptedChecks` pin how the CLI answered each of those commands, and that nothing was linked on the consumer project.

## Fixtures

| Journey                              | OpenAI        | Anthropic `claude-haiku-5-5` | Anthropic `claude-opus-5-5` |
| ------------------------------------ | ------------- | ---------------------------- | --------------------------- |
| `consumer-slack-message`             | hand-authored | recorded                     | none                        |
| `developer-auth-configs-and-execute` | hand-authored | none                         | recorded                    |
| `developer-execute-unconnected`      | hand-authored | none                         | recorded                    |
| `first-run-login`                    | hand-authored | recorded                     | recorded                    |
| `run-inline-script`                  | hand-authored | recorded                     | recorded                    |

"none" means the model's latest recorded run did not reach the journey's goal. Such a run is not turned into a passing test; its transcript is in [`transcripts/`](#transcripts). A journey with no Anthropic fixture at all is reported by the suite as a `todo`.

How a fixture is matched:

- Hand-authored: the first turn matches the prompt; each later turn matches the id of the previous `shell` call and a substring of what that command printed. If the CLI prints something else, the next turn has no match.
- Recorded: aimock's recorder keys a turn on the latest message from the person, the model, and the turn's position. `record.ts` adds the id of the previous call and that command's exit code, so a CLI that now exits differently leaves the replay without a match. The output text of a recorded turn is not part of the match; the journey's checks cover it.

## Recording

One command records one journey with one model, once, with no retries:

```bash
cd ts/e2e-tests/cli/agent-journeys
ANTHROPIC_API_KEY=… bun run record.ts --set <name> --journey consumer-slack-message --provider anthropic --model claude-haiku-5-5
OPENAI_API_KEY=…    bun run record.ts --set <name> --journey consumer-slack-message --provider openai    --model <model>
```

`--set` names what the run measures (`skill-names-playground-execute`, say). The transcript goes to `transcripts/<set>/`.

aimock runs in record mode between the loop and the provider. The loop still sends the placeholder key; aimock swaps it for the key from the environment on the way out, so the key is in no request the loop builds. The script prints the commands with their exit codes and each check, and writes the transcript whether or not the run reached the goal.

- A run that passes every check is written to `fixtures/<journey>.<provider>.<model>.json` and is picked up by the suite from its file name.
- A run that fails a check writes no fixture, and leaves an older fixture of the same journey and model in place. Delete that fixture if the suite should stop replaying the older run. Read the transcript: a model that took the wrong tree is a finding about the skill or the CLI, not a recording to redo until it passes.
- Before anything is written the script refuses output containing the key, a provider key prefix, or a recorded credential header.

A recording costs a few thousand input tokens per turn (the skill is resent each turn) and at most 2,048 output tokens per turn.

To replace a hand-authored OpenAI fixture, record the journey with an OpenAI model and delete the `hand-authored` file.

## Transcripts

`transcripts/<set>/<journey>.<provider>.<model>.json` is one run as it happened, kept whether it passed or not: the prompt, every command with its exit code and output, the model's messages, the person's replies, each check, and what was measured (`revision`, `cliPackageModified`, `skillSha256`, `recordedOn`). Nothing replays them; they are the record of how models behaved.

| Set                        | CLI and skill                                    | Person                                                    | Runs                                            |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| `01-approve-everything`    | `82e851aad`                                      | Approved every login and authorization after each command | All five journeys, both models                  |
| `02-approve-what-is-shown` | `82e851aad`                                      | As described above                                        | The three runs the stricter person could change |
| `03-dev-link-hint`         | `82e851aad` plus the dev-tree not-connected hint | As described above                                        | `developer-execute-unconnected`, both models    |

Reached the goal, per set (`-` means not run in that set):

| Journey                              | Model              | 01  | 02  | 03  |
| ------------------------------------ | ------------------ | --- | --- | --- |
| `consumer-slack-message`             | `claude-haiku-5-5` | yes | -   | -   |
| `consumer-slack-message`             | `claude-opus-5-5`  | yes | no  | -   |
| `developer-auth-configs-and-execute` | `claude-haiku-5-5` | no  | -   | -   |
| `developer-auth-configs-and-execute` | `claude-opus-5-5`  | yes | -   | -   |
| `developer-execute-unconnected`      | `claude-haiku-5-5` | no  | no  | no  |
| `developer-execute-unconnected`      | `claude-opus-5-5`  | no  | yes | yes |
| `first-run-login`                    | `claude-haiku-5-5` | yes | -   | -   |
| `first-run-login`                    | `claude-opus-5-5`  | yes | -   | -   |
| `run-inline-script`                  | `claude-haiku-5-5` | yes | -   | -   |
| `run-inline-script`                  | `claude-opus-5-5`  | yes | -   | -   |

How to read it:

- Every cell is one run. `claude-haiku-5-5` took the root tree, the dev tree, and the root tree again on the same developer prompt across the three sets, so one cell says little about a rate.
- Set 01's `yes` for `claude-opus-5-5` on `consumer-slack-message` was the lenient person's doing: it ran `composio link slack --no-browser`, which reaches nobody. Set 02 is the honest result.
- Set 01's `no` for `claude-opus-5-5` on `developer-execute-unconnected` was a handoff nobody answered: it gave the person the URL and stopped. With a person who answers, it finishes (02, 03).
- In sets 02 and 03, a run that reached the dev tree and then failed did so at the not-connected error; a run that failed on the root tree did so at `composio link slack --no-browser`.

## Measuring a change

The replay suite answers "does the CLI still behave on paths models have taken". It cannot answer "does this change make models do better", because a replay does not consult the model. Recording does, and the pieces here are meant to be the base of that measurement:

- **Environment**: `startCliRig()` gives a sealed machine with the real binary, a seeded backend, and a journal of which project and user every request acted on. It needs no account and has no side effects, so runs are repeatable and can run in parallel.
- **Task**: a journey's `prompt`, `setup`, and starting directory.
- **Grader**: a journey's `checks`. They read exit codes, command output, and the journal, never the model's prose, so a grade is a fact and not a judgement. Each check is reported by name, which says where a failed run went wrong (wrong tree, wrong project, never linked) and not only that it failed.
- **Subject**: the skill text, rendered from source on every run and identified by `skillSha256`; and the CLI, identified by `revision`.
- **Person**: fixed, so two runs differ only in the subject and the model.

To compare two versions of the skill or the CLI, record every journey with each model several times per version under two set names, and compare the rate at which each check passes. A single run per cell, as in the table above, shows what can happen and not how often. `record.ts` records one run per call and overwrites the transcript of the same journey and model within a set, so repeated runs need a set name per repetition until it grows a repetition count.

Add a journey when a real agent failure is found that no journey would have caught: write the prompt a user would type, the state it starts from, and checks on the journal. The cases that separate versions best are the ones where the two trees are easy to confuse, a connection is missing, or the person has to act.

## The skill's commands

`skill-commands.test.ts` needs no model: it takes every `composio …` line from the code blocks of the built skill and its references and looks its command path up in the binary.
