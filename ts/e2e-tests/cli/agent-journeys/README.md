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
- **A replay does not notice a changed skill or a changed tool schema.** A fixture is matched on the turn's position, the previous call, and that command's exit code (hand-authored: a substring of its output). The system prompt and the schema text a command printed are not part of the match, so after a skill edit the replays stay green and say nothing about the new skill. Only a new recording does.

A replay on its own proves nothing: aimock answers the same whether a command succeeded or failed. So every journey is judged by its checks (`src/journeys.ts`), which read the commands that ran, their exit codes and output, and the fake backend's journal: which tool ran, on which project, as which user. None of them reads the model's prose. See [How a run is graded](#how-a-run-is-graded).

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

They approve an authorization when its page reaches them: the CLI opened it, or the agent wrote its complete URL (the fake's origin, the path, the id). An id on its own, or the same path on another host, is not a page anyone can open, and approves nothing. Markdown around the URL is fine; a URL written without `https://` is not recognised, which is a limit of this model.

When the agent has stopped to wait, they answer `Done, I approved it in my browser. Please continue.`, and the agent gets another turn. They say it once per approval, and only while no command of the agent has been told of it: after `composio login --poll` returned the linked session there is nothing to wait for, and the person stays quiet. So handing the person the URL and stopping is a correct move, not a failure: the journey goes on, and its checks are the same as for an agent that waited.

`person.test.ts` pins these rules without a container.

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

`developer-execute-unconnected` is the tree-confusion case. Its hand-authored fixture scripts a model that first uses the root tree's word on the dev tree (`composio dev execute`), recovers from the parse error, then follows the CLI's not-connected hint, which names the dev-tree link. Its `scriptedChecks` pin how the CLI answered each of those commands.

## How a run is graded

A journey has two lists, and they answer different questions.

**Checks** decide whether the run reached the goal. They grade what the run changed, not what it tried:

- One tool execution completed in the whole run, on any project and through any of the three execute routes, and it was the message asked for: the right project and user, `#general` (or `general`), and the text verbatim. A second send, a send on the other project, another channel, and other words each fail a check of their own, so a text mismatch is not mistaken for tree confusion. A developer execution must also name its project in the request; a session that happened to resolve to the right one is not enough.
- No account became connected on a project the task does not involve. A person who approved `composio link slack` during a developer task gave access nobody asked for, and it stays.
- `run-inline-script`: the send happened during a `composio run` command that exited 0 and printed the timestamp, not during a `composio execute` followed by a script that prints what it was told.
- `first-run-login`: a new `composio whoami` after the model stopped exits 0 as the person, in their org. The requests of the process that logged in do not show that anything was stored.

**Detours** are what a confused agent does on the way: a `composio dev` command during a consumer task, a root `composio execute` or `composio link` during a developer task, a request to the other project that changed nothing. A detour never fails a run. A run that tried the wrong tree, read the error, and finished on the right one reached the goal, and its detours say how it got there. Reading the two lists separately gives a success rate and a wrong-tree rate; `composio dev --help` during a consumer task counts toward the second and not against the first.

The hand-authored path of each journey must take no detour: it is the path the skill teaches.

`journeys.test.ts` runs the graders on made-up evidence, without a container: for each journey a run that reached the goal, and each way of looking as if it did.

## Fixtures

| Journey                              | OpenAI        | Anthropic `claude-haiku-5-5` | Anthropic `claude-opus-5-5` |
| ------------------------------------ | ------------- | ---------------------------- | --------------------------- |
| `consumer-slack-message`             | hand-authored | recorded                     | none                        |
| `developer-auth-configs-and-execute` | hand-authored | none                         | recorded                    |
| `developer-execute-unconnected`      | hand-authored | none                         | recorded                    |
| `first-run-login`                    | hand-authored | recorded                     | recorded                    |
| `run-inline-script`                  | hand-authored | recorded                     | recorded                    |

"none" means the model's latest recorded run did not reach the journey's goal. Such a run is not turned into a passing test; its transcript is in [`transcripts/`](#transcripts). A journey with no Anthropic fixture at all is reported by the suite as a `todo`.

Recordings are optional; the hand-authored path is not. The suite fails when a journey has no hand-authored fixture, when a file in `fixtures/` is not named `<journey>.<provider>.<model>.json`, and when a fixture names a journey that does not exist, so a deleted or misnamed file cannot remove a journey's coverage unnoticed.

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

`--set` names what the run measures (`skill-names-playground-execute`, say). The transcript goes to `transcripts/<set>/`, with the run's checks and its detours.

aimock runs in record mode between the loop and the provider. The loop still sends the placeholder key; aimock swaps it for the key from the environment on the way out, so the key is in no request the loop builds. The script prints the commands with their exit codes and each check, and writes the transcript whether or not the run reached the goal.

- A run that passes every check is written to `fixtures/<journey>.<provider>.<model>.json` and is picked up by the suite from its file name.
- A run that fails a check writes no fixture, and leaves an older fixture of the same journey and model in place. Delete that fixture if the suite should stop replaying the older run. Read the transcript: a model that took the wrong tree is a finding about the skill or the CLI, not a recording to redo until it passes.
- Before anything is written the script refuses output containing the key, a provider key prefix, or a recorded credential header.

A recording costs a few thousand input tokens per turn (the skill is resent each turn) and at most 2,048 output tokens per turn.

To replace a hand-authored OpenAI fixture, record the journey with an OpenAI model and delete the `hand-authored` file.

## Transcripts

`transcripts/<set>/<journey>.<provider>.<model>.json` is one run as it happened, kept whether it passed or not: the prompt, every command with its exit code and output, the model's messages, the person's replies, each check, and what was measured (`revision`, `cliPackageModified`, `skillSha256`, `recordedOn`). Nothing replays them; they are the record of how models behaved.

A transcript keeps the checks as they were when it was recorded. Sets 01 to 03 predate the stricter send, connection, and stored-login checks described under [How a run is graded](#how-a-run-is-graded) and have no `detours`; their commands and output are complete, so they can be read against today's rules by hand, but not re-graded, because a transcript does not hold the fake's journal.

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
- **Grader**: a journey's `checks` for success and its `detours` for how the run got there; see [How a run is graded](#how-a-run-is-graded). They read exit codes, command output, and the journal, never the model's prose, so a grade is a fact and not a judgement. Each is reported by name, which says where a failed run went wrong (wrong project, never linked, wrong text) and not only that it failed. Compute the wrong-tree rate from the detours of every run, the failed ones included.
- **Subject**: the skill text, rendered from source on every run and identified by `skillSha256`; and the CLI, identified by `revision`.
- **Person**: fixed, so two runs differ only in the subject and the model.

To compare two versions of the skill or the CLI, record every journey with each model several times per version under two set names, and compare the rate at which each check passes. A single run per cell, as in the table above, shows what can happen and not how often. `record.ts` records one run per call and overwrites the transcript of the same journey and model within a set, so repeated runs need a set name per repetition until it grows a repetition count.

What this base does not have yet, and a tool that runs journeys many times will need:

- **Attempts.** A repetition overwrites the previous transcript of the same journey and model in a set, and a run that throws before grading leaves no transcript.
- **Cost and time.** Transcripts carry no token usage and no duration.
- **The exact subject.** `revision` plus `cliPackageModified` does not identify an uncommitted binary; there is no hash of the binary, the journey, the person, or the grader.
- **A deadline.** Twelve model turns bound neither the number of commands in a turn nor the total time; each command is capped at 90 seconds and the replay suite has a test timeout, but `record.ts` has no overall limit.
- **Enforced isolation.** The container reaches the fake because every host the CLI knows is redirected to it, not because other traffic is blocked. Images are addressed by a version tag that two checkouts can share.
- **Breadth.** Every journey starts with the binary installed and uses the org's default developer project, where a request with no project scope lands on the right project by the fake's fallback. There is no journey for installing or upgrading, for a non-default project, for a script read from a file or stdin, and the person never declines, is never slow, and always has a browser.

Add a journey when a real agent failure is found that no journey would have caught: write the prompt a user would type, the state it starts from, and checks on the journal. The cases that separate versions best are the ones where the two trees are easy to confuse, a connection is missing, or the person has to act.

## The skill's commands

`skill-commands.test.ts` needs no model: it takes every `composio …` line from the code blocks of the built skill and its references and looks its command path up in the binary.
