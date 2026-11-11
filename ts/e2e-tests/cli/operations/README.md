# CLI operation suites and fault catalogue

Deterministic end-to-end tests of the operations an agent drives the `composio` binary through: login and session, `whoami`/`logout`, `search`, `execute`, `link`, `connections`, `run`, `upgrade`, and their `composio dev` counterparts. No model is involved. The binary runs in a journey container (`startJourneyContainer` from `@e2e-tests/utils`) and talks only to the fake backend in [`../fake-backend`](../fake-backend/README.md).

Every test asserts three things where they apply: what the command returned (exit code, stdout, stderr), what the fake backend received (route, key class, project, user), and what was left on disk.

```bash
pnpm --filter @e2e-tests/cli-operations test:e2e:cli        # all files
cd ts/e2e-tests/cli/operations && bun test identity.test.ts  # one file
```

A failing run leaves `DEBUG.<name>.log` files here with each command and its output.

## Reading the catalogue

The catalogue starts from one question: what can go wrong for a CLI that an agent runs unattended, where nobody reads stderr unless the exit code says so, and a wrong success is worse than a failure? Each row names a fault, where it is injected, and what must hold.

- **exit**: the CLI's exit code. **stdout**: `data` means pure machine-readable output and nothing else; `empty` means zero bytes.
- **Status**: `ok` is implemented and passing. `expected failure` is implemented with `it.failing` because the CLI does not do what the row says today; the test turns red when the CLI is fixed, and the marker is then removed. `known gap` is behaviour that hinders an agent but that nothing in the repo declares wrong; a passing test pins what the CLI does today, so a change is noticed, and the row says what would be better.

### Identity: which project, which user (`identity.test.ts`)

| Fault or question                                                                                                         | Injected at                               | Must hold                                                                                                                 | Status                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root `execute` run from an initialized developer directory                                                                | cwd                                       | One Dashboard execution, consumer project, consumer user, user key; no request names the developer project                | ok                                                                                       |
| Dev `playground-execute`                                                                                                  | cwd                                       | One backend session execution, developer project, global test user; nothing goes to the Dashboard or the consumer project | ok                                                                                       |
| Dev `--user-id`                                                                                                           | flag                                      | The session acts as that user                                                                                             | ok                                                                                       |
| Dev `--project-name`                                                                                                      | flag                                      | The session is on the named developer project                                                                             | ok                                                                                       |
| Project API key minted by `dev init`                                                                                      | journal                                   | Never sent by any command; every request carries the user key                                                             | ok                                                                                       |
| Account linked on one tree, used on the other                                                                             | world                                     | Not connected on the other tree, both directions                                                                          | ok                                                                                       |
| Root `execute` without a connection                                                                                       | world                                     | exit 1; the error names `composio link <toolkit>`                                                                         | ok                                                                                       |
| Dev `playground-execute` without a connection                                                                             | world                                     | exit 1; the error names `composio dev connected-accounts link <toolkit>`, not the root-tree `composio link`               | ok                                                                                       |
| `dev auth-configs list` in a directory set up for another project                                                         | `.composio/project.json`                  | The request is scoped to that project                                                                                     | expected failure: the request carries no org or project scope                            |
| Command from the other tree (`dev execute`, `dev link`, root `playground-execute`, root `auth-configs`, root `--user-id`) | argv                                      | exit 1; stdout empty; stderr names the unknown subcommand or flag and lists the real commands; no request                 | ok                                                                                       |
| `composio dev link`                                                                                                       | argv                                      | stderr names `composio dev connected-accounts link`                                                                       | known gap: the `dev` help lists `connected-accounts`, but no equivalent command is named |
| `composio dev link --help`                                                                                                | argv                                      | exit 1                                                                                                                    | known gap: prints the `dev` help and exits 0                                             |
| Missing acting user, root tree                                                                                            | resolve returns an empty consumer user id | exit 1; `Missing consumer user id. Run composio login and try again.`; no execution                                       | ok                                                                                       |
| Missing acting user, dev tree, no project for the directory                                                               | cwd                                       | exit 1; `No developer project configured for this directory. Run composio dev init.`; no request                          | ok                                                                                       |
| Missing acting user, dev tree, `--project-name`, no test user                                                             | stored login                              | exit 1; `Missing user id. Provide --user-id, or run composio login …`; no execution                                       | ok                                                                                       |

### Login and session (`login-session.test.ts`)

"Session" here is the CLI login session (created, polled, linked) and the session artifact directory.

| Fault or question                    | Injected at | Must hold                                                                                                                           | Status                                                           |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| First run, `whoami`                  | empty home  | exit 1; stdout empty; names `composio login`; no request                                                                            | ok                                                               |
| Headless `login`                     | no terminal | exit 0; one session created; URL with the session key and `composio login --poll` on stdout; pending session cached; nothing stored | ok                                                               |
| `login --poll`, session never linked | world       | Keeps polling (at least two reads in 8 s); nothing stored                                                                           | ok                                                               |
| `login --poll`, session linked       | world       | exit 0; JSON summary; key, backend URLs, org and global test user stored; pending file removed                                      | ok                                                               |
| `whoami` after login                 |             | exit 0; JSON on stdout; stderr empty; only user-key requests                                                                        | ok                                                               |
| `login` when already logged in       |             | exit 0; no request; stored login unchanged                                                                                          | ok                                                               |
| `logout`                             |             | Key removed; `whoami` then exits 1 without a request                                                                                | ok                                                               |
| `login --key`, session not linked    | world       | exit 1; `Session not yet linked`; nothing stored                                                                                    | ok                                                               |
| `login --key`, linked                | world       | exit 0; login stored                                                                                                                | ok                                                               |
| `login --key`, unknown session       | 404         | exit 1; names `composio login --no-wait`; nothing stored                                                                            | ok                                                               |
| `login --user-api-key`, rejected key | 401         | exit 1; stdout empty; key not written anywhere                                                                                      | ok                                                               |
| Same, as an expected failure         | 401         | No defect report                                                                                                                    | expected failure: printed as a defect report with an empty title |
| `artifacts cwd`                      |             | exit 0; one absolute path; no login or request needed; stable per directory; follows `COMPOSIO_SESSION_DIR`                         | ok                                                               |

### Network (`network-faults.test.ts`)

| Fault                                                                          | Injected at                                               | Must hold                                                                                                  | Status                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Connection refused                                                             | `COMPOSIO_BASE_URL` to a closed port                      | exit 1; stdout empty; `ECONNREFUSED` on stderr                                                             | ok                                                                      |
| HTTP 500, 429, HTML 502 page, reset before response, on every attempt          | `search`                                                  | exit 1; stdout empty; cause on stderr; three attempts                                                      | ok                                                                      |
| Reset in the middle of the body                                                | `search`                                                  | exit 1; stdout empty; one attempt                                                                          | ok                                                                      |
| Body that is not JSON                                                          | `search`                                                  | exit 1; stdout empty; says the response shape is unexpected and names `composio upgrade`                   | ok                                                                      |
| One 500, one 429 with Retry-After, one reset, then healthy                     | `search`                                                  | exit 0; stderr empty; normal result; two attempts                                                          | ok                                                                      |
| Slow response (4 s)                                                            | `search`                                                  | exit 0; one attempt                                                                                        | ok                                                                      |
| Valid JSON of another shape; empty 200 body                                    | `search`                                                  | exit 1 with an unexpected-response message                                                                 | expected failure: crashes with a `TypeError` naming a minified variable |
| HTTP 500, 429, HTML page, non-JSON body, reset before response, reset mid-body | tool execution, Dashboard transport and backend transport | exit 1; **exactly one execution request**; stdout is JSON with `successful: false` and an error; no `data` | ok                                                                      |

Observed and left as is: on the backend transport an HTML error page is copied whole into the `error` field of the result.

### Auth (`auth-faults.test.ts`)

| Fault                                        | Injected at                             | Must hold                                                                                                                                                                                | Status                                                   |
| -------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| No key                                       | empty home, seven root and dev commands | exit 1; stdout empty; names `composio login`; no request                                                                                                                                 | ok                                                       |
| Key only in `COMPOSIO_USER_API_KEY`          | env                                     | exit 1; names `composio login` or `composio orgs switch`; no request                                                                                                                     | ok                                                       |
| Stored key rejected (401 everywhere)         | all backend routes                      | exit 1; rejection visible; nothing but 401s; stored login untouched                                                                                                                      | ok                                                       |
| Same, recovery command                       |                                         | Names `composio login`                                                                                                                                                                   | expected failure: `search` prints only `Invalid API key` |
| Same, `whoami`                               |                                         | exit 1; stdout empty                                                                                                                                                                     | expected failure: exit 0 and a JSON object of nulls      |
| Key sent to a backend that did not issue it  | `COMPOSIO_BASE_URL` to a second fake    | Warning on stderr naming both backends and `composio logout && composio login`; stdout free of it; the other backend rejects the key; nothing reaches the issuer; stored login untouched | ok                                                       |
| Project key (`ak_`) where a user key belongs | `COMPOSIO_USER_API_KEY`                 | Arrives classified as a project key and is rejected                                                                                                                                      | ok                                                       |

### Filesystem (`filesystem-faults.test.ts`)

| Fault                                                                     | Injected at                    | Must hold                                                                     | Status                                      |
| ------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Stored login truncated, wrong JSON type, empty, missing                   | `user_data.json`               | exit 1; names `composio login`; no request; a new login repairs it            | ok                                          |
| Corrupt `update-check.json`, `config.json`, `tool-permissions-cache.json` | `~/.composio`                  | Command still succeeds                                                        | ok                                          |
| Corrupt cached tool schema                                                | `tool_definitions/<SLUG>.json` | Fetched again                                                                 | expected failure: fatal `is not valid JSON` |
| Same                                                                      |                                | At least names the file; deleting it recovers                                 | ok                                          |
| Read-only home (ordinary user)                                            | `chmod -R a-w ~/.composio`     | `whoami`, `search`, `execute` succeed with data on stdout; the tool runs once | ok                                          |
| Read-only home, `logout`                                                  |                                | exit 1; names the file; login untouched                                       | ok                                          |
| Eight concurrent `search` on a cold cache                                 | background jobs                | All exit 0; no stderr; cache file valid JSON; login intact                    | ok                                          |
| Four concurrent `execute`                                                 |                                | All exit 0; four executions, one each                                         | ok                                          |
| Four concurrent `login`                                                   |                                | All exit 0; one complete stored login; no temporary files left                | ok                                          |

### Process and streams (`process-streams.test.ts`)

| Fault                                       | Injected at                | Must hold                                                                        | Status                                                           |
| ------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| SIGINT / SIGTERM while `link` waits         | `kill` after 2 s           | exit 130 / 143; stdout empty; the link was requested once                        | ok                                                               |
| SIGINT while `run` executes a script        |                            | exit 130; stdout empty                                                           | ok                                                               |
| `link` off a terminal, nobody authorizes    | no terminal                | The authorization URL is printed before the wait                                 | expected failure: nothing is printed until the account is active |
| `link --no-wait`                            |                            | exit 0; JSON with the URL; no status polling                                     | ok                                                               |
| Reader closes stdout early (`… \| head -1`) | pipe                       | CLI exits 0; no stderr                                                           | ok                                                               |
| `-d -` with JSON on stdin                   | pipe                       | Arguments read from stdin                                                        | ok                                                               |
| `-d -` with nothing on stdin                | `/dev/null`                | exit 1 at once; stdout empty; no execution                                       | ok                                                               |
| No terminal on any stream                   |                            | stdout is the JSON; stderr empty                                                 | ok                                                               |
| stdout piped, stderr a terminal             | `script`                   | JSON in the pipe; human rendering on the terminal, not a second copy of the data | ok                                                               |
| stdout a terminal, stderr redirected        | `script`                   | No data on the terminal                                                          | ok                                                               |
| Update notice pending                       | seeded `update-check.json` | Never on stdout; shown on a terminal stderr                                      | ok                                                               |
| Plugin hint under an agent host             | `CLAUDECODE=1`             | On stderr; never on stdout                                                       | ok                                                               |
| `search --human` off a terminal             | no terminal                | Results are printed                                                              | expected failure: prints nothing, exits 0                        |

### Upgrade (`upgrade.test.ts`, and `../upgrade`)

Every row: a failed upgrade leaves the executable's inode, size and mtime unchanged, and `composio version` still runs.

| Fault                                        | Injected at                        | Must hold                                                                          | Status            |
| -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| No archive for this platform                 | release assets                     | exit 1; says so; no download                                                       | ok                |
| Checksum mismatch                            | `checksums.txt`                    | exit 1; expected and actual digests; no extraction                                 | ok                |
| Corrupt archive with matching checksum       | archive bytes                      | exit 1; `Failed to extract zip archive`                                            | ok                |
| Download cut off mid-body                    | download route                     | exit 1; one download attempt                                                       | ok                |
| Pinned version never released                | release-by-tag 404                 | exit 1; names the tag; no download                                                 | ok                |
| Pinned version                               | two releases                       | Downloads the pinned release's archive, not the latest                             | ok                |
| Already on the latest release                | `release-tag.txt`                  | exit 0; no download; executable untouched                                          | ok                |
| No write permission on the install directory | read-only directory, ordinary user | exit 1; names the file; executable untouched and runnable; no temporary files left | ok (`../upgrade`) |

Install faults live in [`../install`](../install/README.md), which runs in its own workflow against a packaged release: checksum mismatch, corrupt archive, missing platform archive, and a download cut off partway.

### Tool loop (`tool-loop.test.ts`)

Not faults: the search, execute, link, execute loop and the commands around it (`connections list`, `--get-schema`, `--dry-run`, input validation, unknown slug, `run` with `execute()` and `search()`), each checked against the journal.

## Not modelled

Listed so nobody reads their absence as coverage.

- **Network**: packet loss, duplicated or reordered responses, partitions that heal mid-request, DNS failure, TLS errors other than an untrusted certificate, proxies (`HTTP_PROXY`), IPv6, redirects, timeouts the CLI gives up on (the Dashboard deadline is 15 minutes), responses larger than memory.
- **Backend state**: an account that expires between the connection check and the execution, a tool that ran although its response was lost (the fake cannot act without answering), rate limits that depend on history, pagination past one page, several accounts per toolkit and `--account` selection, enhanced-controls permission prompts.
- **Auth**: key rotation mid-command, OS keyring storage (the container has no Secret Service, so the key is stored in `user_data.json`), agent keys beyond what `../agent-signin` covers, org switching.
- **Filesystem**: full disk, a home on a network or case-insensitive filesystem, symlinked `~/.composio`, files written by a newer or older CLI version, a stale cache that is valid JSON but out of date, two CLIs of different versions sharing a home.
- **Process**: SIGHUP, SIGKILL, a second signal during shutdown, being killed between writing a temporary file and renaming it, stdin as a terminal with a person typing, terminal resize, non-UTF-8 locales.
- **Upgrade and install**: a successful upgrade through the download path (the archive here is never a real build), upgrading while another invocation runs, a partially replaced companion module, macOS and Windows.
- **Platforms**: everything here runs the Linux binary of the host's architecture as root in Debian; macOS, x64-on-arm, musl, and non-root homes (apart from the read-only rows) are not exercised.
- **Commands**: `proxy`, `listen`, triggers, logs, `generate`, `setup`, `orgs`, and `dev` commands beyond `init`, `auth-configs list`, `playground-execute`, and `connected-accounts link`/`list`.
