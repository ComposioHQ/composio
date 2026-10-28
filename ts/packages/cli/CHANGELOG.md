# @composio/cli

## Unreleased

### Minor Changes

- A signal now ends each command the way its work ends. A one-shot command,
  `composio login` and `composio upgrade` stopped with Ctrl-C (SIGINT), SIGTERM
  or a closed terminal (SIGHUP) exit 130, 143 or 129. They used to exit 0, so a
  wrapper or `set -e` script read a cancelled command as a successful one.
  `composio listen` and `composio dev triggers listen` (`composio dev listen`)
  treat Ctrl-C and SIGTERM as the way to stop them once subscribed: they
  disable the temporary trigger, print their summary, and exit 0. A signal
  before the subscription is confirmed, or SIGHUP, exits 130, 143 or 129 instead.
  `composio run` forwards SIGINT, SIGTERM and SIGHUP to its script and ends the
  way the script did: with its exit code, or killed by the same signal. A
  script still running 2 seconds later gets SIGTERM, then SIGKILL; a script the
  CLI had to kill this way ends the CLI by the signal it received. A second
  signal, or a stop that takes longer than 10 seconds, ends the CLI at once:
  128 plus the signal's number, or, for `composio run`, the script's process
  group is killed and the CLI is killed by that signal.

- `composio dev connected-accounts link <toolkit>` (with or without `--list`)
  now acts on your developer project, like the other `composio dev` commands:
  the directory's project, or the one `--project-name` names. It links or lists
  accounts for `--user-id` when given, else the directory's test user id (for
  the directory's own project), else the global test user id. Without
  `--project-name` it used to act as your consumer user on your consumer
  project and silently ignore `--user-id`; outside a directory set up with
  `composio dev init` it now fails asking for one. With `--project-name`,
  linking a toolkit now also uses the directory's test user when the name is
  the directory's own project. `composio link` is unchanged. With
  `--auth-config`, a missing developer project is now reported before a
  missing user id. On the dev tree, the alias hints point at
  `composio dev playground-execute` and `composio dev connected-accounts list`.

- `composio listen`, `composio dev listen` and `composio dev triggers listen`
  gain `--fail-fast`: the listener stops at the first event it fails to save,
  forward, or append to `--out`, prints how many events failed on stderr, and
  exits 1. Without it, a failed event is still reported and skipped, and the
  exit code stays 0.

- `composio execute`, `composio proxy` and `composio listen` (for a trigger
  slug) now fail with an error listing the candidate accounts, instead of
  silently using the newest one, when a toolkit has several connected accounts,
  none is aliased `default`, and no `--account` is passed. Scripts that relied
  on the implicit newest-account pick now fail. To migrate, pass
  `--account <id|alias>`, or alias one account `default`.

### Patch Changes

- `composio connections list`, `composio connections remove`, and
  `composio listen` without a consumer user now print the message on stderr
  and exit 1, like other expected errors. They used to print it under a `💥`
  banner with the error tag and a stack location. Telemetry: every missing-user
  failure now reports `error_name` `commands/MissingActingUserError` in
  `cli.command.failed` and the command-family failure events, replacing
  `ToolExecutionError` (execute), `commands/CommandInputError` (search),
  `commands/MissingLinkUserIdError` (link),
  `commands/MissingConnectionsConsumerUserIdError` (connections list),
  `commands/MissingConnectionRemovalConsumerUserIdError` (connections remove),
  `commands/ListenCommandError` (listen), and `commands/ProxyCommandError`
  (proxy). Other failures of those commands keep their names.

- Every `composio dev` command that acts as a user now names the test user it
  falls back to on stderr (`Using test user id "…"` for the directory's,
  `Using global test user id "…"` for the global one) when you pass no
  `--user-id`. `composio dev playground-execute` printed nothing before; with
  `--parallel` it names the user once.

- A missing user id now gets the same message on every command of a tree.
  Root commands (`composio execute`, `search`, `link`, `listen`, `proxy`,
  `connections`) report a missing consumer user id and point at
  `composio login`; root `execute`, `search`, and `link` no longer tell you to
  pass `--user-id`, which the root tree does not take, and `listen` and `proxy`
  no longer describe a missing "project context". `composio dev` commands point
  at `--user-id` or `composio dev init`, or at `--user-id` or `composio login`
  with `--project-name`.

- An empty consumer user id now counts as no user on every command.
  `composio execute`, `composio search`, and `composio link` fail with the
  missing-user error and exit 1, as `composio connections`, `composio listen`,
  and `composio proxy` already did; they used to send requests for the user
  `""`. `composio run` starts the script without the consumer user's context,
  as it does when there is no consumer user.

- CLI telemetry now records the command `effect/cli` parsed instead of guessing
  it from argv. `composio signup`, `agent …`, `connections …`, `config …`,
  `debug …` and `help …` were recorded as `composio`, `composio dev init` as
  `dev`, and `composio setup skill` as `setup` with the `CLI_SETUP_*` events;
  each is now recorded under its own command path with the generic
  `CLI_COMMAND_*` events. A rejected invocation (unknown command or flag,
  missing argument) is recorded with the command path the parser reached and
  `failure_reason_code: "parse_error"`. Every other command path and event
  family is unchanged.

- CLI telemetry now records a command that prints its own
  failure and exits 1 (a failed API request, an alias conflict on
  `composio link`, a `--fail-fast` listener stop) as failed instead of
  succeeded, and a `composio run` whose script exits non-zero as
  `CLI_RUN_FAILED` with `failure_reason_code: "child_exit"`.

- `composio execute` now exits 1 when an argument names a file on your machine
  but the tool does not accept file uploads for that input, such as `file` in
  `TRELLO_ADD_CARDS_ATTACHMENTS_BY_ID_CARD`. It used to send the path text to
  the tool and report success, and the tool stored that text instead of the
  file. The error names the input and the path. Nothing is sent. `--dry-run`
  reports the same error. Paths that do not exist on your machine are still
  sent as before.

- Local file uploads now use the filename's MIME type instead of always declaring
  `application/octet-stream`. `execute --file` preserves arrays and injects into
  the single matching upload field in an existing array item; ambiguous targets
  require explicit JSON. This fixes Word and PowerPoint image editing through the CLI.

- `composio listen` now picks the connected account for a trigger slug the way
  `composio execute` and `composio proxy` do, through the same resolver, so the
  three commands choose the same account for the same `--account` (or its
  absence). An `--account` that matches no active account, or a failed account
  lookup, now fails with the message those commands print, as a plain message
  on stderr with exit 1.

- In `composio run`, a `File` or `Blob` passed to `execute()` now uploads with
  its own `type`, even when its name has no extension, and a `File` keeps its
  name. It used to upload as `application/octet-stream` under a name with a
  random prefix, such as `1bfa14f5-deck.pptx`. A nameless `Blob` whose type has
  no short extension, such as PPTX, is named `file-<id>.bin`.

- `composio upgrade` no longer starts with a stale "Update available" line.
  The line came from the cached daily update check, so right after a release
  it could name an older version than the one `composio upgrade` then
  installed. Upgrading also refreshes that cache with the latest stable release
  it found, so later commands stop suggesting an older version. Installing a
  specific version, a beta, or a pinned release tag leaves the cache unchanged.

- `composio proxy` now enforces the consumer permission policy that
  `composio execute` enforces, checked against the connected account the
  request uses. A denied request fails with the same permission error, and a
  request that needs approval opens the same approval page, before anything is
  sent.

- A tool call or proxied request that a session hook blocks is now reported as
  a failure carrying the hook's message. `composio execute` prints it as a
  failed call (`successful: false`) with the message in `error`; on consumer
  projects, whose calls go through the Dashboard, it used to fail as a response
  the CLI could not read. `composio proxy` fails naming the hook instead of
  printing a response with no status.

- `composio connections list` now prints each account's `id`, its `alias`
  whenever it has one (previously only when a toolkit had several accounts),
  and `display_name` — the provider identity from `state.val.displayName`,
  trimmed and capped at 200 characters — when Composio has filled one in.
  Nothing else is read from `state`.

- `composio connections list`, `composio connections remove`, and
  `composio dev connected-accounts list` exit 1 when the connected-accounts
  response does not match the shape this CLI expects, naming the mismatched
  fields. They used to warn and continue with the unchecked response.

- The CLI now uses `@composio/client@2.0.0-rc.22` (up from `2.0.0-rc.20`). No
  command changes.

- `composio dev triggers create` now accepts `--user-id` and sends it with the
  request, so it works on projects with 2FA enabled, which require the user who
  owns the connected account. It used to reject `--user-id` and send no user,
  so creating a trigger on those projects always failed. Without `--user-id`
  it sends the project's test user id, else the global test user id, and names
  the one it used on stderr; with neither configured it sends no user, as
  before. Given a user and no `--connected-account-id`, the API picks that
  user's first active connection for the trigger's toolkit.

- More expected errors now print as a plain message on stderr and exit 1, like
  other usage errors. They used to print under a `💥` banner with the error tag
  and a stack location, as if the CLI had crashed. The message itself is
  unchanged, and nothing is printed on stdout. This covers:
  - `composio execute` without a user id, or with a `--file` the tool has no
    file input for (or whose field `-d` already sets)
  - `composio proxy` when the project has no consumer user
  - `composio link` without a user id, or when the authorization is not
    finished before the CLI stops waiting
  - `composio login` with an `--org` that does not exist, a session key that
    expired or is not linked yet, a login that is not finished in time, or
    `--poll` without a pending (or with an expired) login
  - `composio generate` outside a recognizable JavaScript or Python project, or
    without `@composio/core` or `composio-core` installed
  - a `COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>` override naming a toolkit or version
    that does not exist

- `composio execute` and `composio proxy` no longer print a `💥` banner after
  reporting that the toolkit is not connected (when the connected-account cache
  is on). The message, tips, and `{"successful": false, ...}` JSON on stdout
  are unchanged, and the exit code is still 1.

- `composio link` and `composio dev connected-accounts link` now exit 1 with
  the usage message on stderr when their flags can't run: a toolkit together
  with `--auth-config`, neither a toolkit nor `--auth-config`, `--auth-config`
  without a developer project, and `--list` without a toolkit or with
  `--auth-config`. They used to exit 0, and printed the message only when
  stderr was a terminal, so scripts, CI and agents saw no output and a
  successful exit. The messages are unchanged.
- These commands now exit 1 and print their message on stderr. They used to
  exit 0, and printed the message only when stderr was a terminal, so scripts,
  CI and agents saw no output and a successful exit. The messages are
  unchanged.
  - Missing input, before any request: `composio whoami` without a login,
    `composio dev projects list` without `--org-id` or a current org,
    `composio triggers info` and `composio dev triggers info` without a
    `<slug>`, `composio dev toolkits info` without a `<slug>`,
    `composio dev triggers disable` without an `<id>`, and
    `composio dev connected-accounts info` and
    `composio dev connected-accounts whoami` without an `<id>`.
  - Missing input that needs one lookup first: `composio dev init` without a
    stored API key or org (it checks your saved login), and
    `composio connections remove` with a selector that matches no connection
    or more than one (it fetches your connections). Both fail before they
    change anything.
  - Failures after a request: `composio dev toolkits info` for a toolkit it
    cannot fetch or find, `composio dev toolkits version` for a toolkit it
    cannot fetch, `composio dev init` in an org without projects, and
    `composio link` and `composio dev connected-accounts link` when the link
    request fails, the link response is incomplete, the `--alias` is already
    taken, or an account already exists and no `--alias` was passed.
- These commands already exited 1 but printed their message only when stderr
  was a terminal; they now print it on stderr either way:
  `composio dev toolkits list` and `composio dev toolkits search` when the
  request fails, `composio listen`, `composio dev listen` and
  `composio dev triggers listen` when the realtime subscription fails, and
  the `composio agent` commands, `composio signup` and `composio login` when
  the stored agent identity can't be used.
- `composio connections remove` gains `--yes` (`-y`) to remove without the
  confirmation prompt, and `composio logout` accepts `--yes` (`-y`) next to
  `--force` (`-f`). When not running interactively, both used to answer their
  own prompt with "no", remove nothing and exit 0; without `--yes` they now
  exit 1 with "needs --yes when not running interactively" on stderr, before
  any request (for `logout`, only when logged in as an agent, the case that
  asks). Declining the prompt on a terminal still removes nothing and exits 0.
- `composio listen`, `composio dev listen` and `composio dev triggers listen`
  now print how many events they failed to save, forward, or append to `--out`
  on stderr when they stop, including on Ctrl+C. The per-event warnings were
  shown only when stderr was a terminal. One failed event still does not stop
  the listener, and the exit code is unchanged.
- `composio listen --max-events N` now stops after N matching events even when
  saving one of them fails. It used to keep listening until interrupted.

## 0.5.0

### Minor Changes

- Breaking: some commands now exit 1 where they used to exit 0. Scripts and
  agents that read the exit code to decide whether a call worked now get the
  right answer; a script that relied on exit 0 after a failed execution must
  handle exit 1. Output on stdout and stderr is unchanged.

- `composio execute` now exits 1 when a tool execution fails: the tool
  reported a failure, the Composio Dashboard or backend could not run it, or,
  with `--parallel`, any one of the calls failed. It used to exit 0. Meta tools
  behave the same. The `{"successful": false, ...}` JSON on stdout and the
  messages on stderr are unchanged. In `composio run`, `execute()` still
  rejects with the tool's error message and the failed result.

- These commands now exit 1 instead of 0 when their input is missing or
  invalid, printing the same message and example on stderr and nothing on
  stdout. No request is sent.
  - `composio dev auth-configs info` without an `<id>`
  - `composio dev auth-configs create` with `--custom-credentials` that is not
    a JSON object
  - `composio tools info` without a `<slug>`
  - `composio dev triggers create` without a `<trigger-name>`, or with
    `--trigger-config` that is not a JSON object
  - `composio dev triggers enable` without an `<id>`

- `composio orgs switch` now exits 1 and asks you to run `composio login`
  when the stored `api_key` is empty. It used to warn and exit 0. Nothing is
  written in either case.

### Patch Changes

- `composio dev connected-accounts list` now reports a response whose `items`
  is not a list as a request error and exits 1. It used to crash.

- `composio execute` and `composio proxy` now report an `--account` that
  matches no connected account (`No connected account matched "…"`) as one
  line on stderr and exit 1, like other usage errors. They used to print it
  under a `💥` banner with the error tag and a stack location, as if the CLI had
  crashed. A failure to load the toolkit's connected accounts is reported the
  same way. Nothing is printed on stdout.

- `composio execute` now sends the execution itself (single, `--parallel`, and
  meta tools) through the Composio Dashboard instead of calling the backend
  directly. Output, exit codes, error details, connection tips, and `--json`
  shapes are unchanged for tool results and for the request errors the backend
  reports; a backend outage is reported with the Dashboard's own message. No
  new login or configuration is needed.
  `composio dev playground-execute` and every other command still call the
  backend. A `COMPOSIO_BASE_URL` override without `COMPOSIO_WEB_URL` keeps
  `composio execute` on that backend; set both to use that deployment's
  Dashboard. The request is sent once, with no retry and no redirect following,
  and gives up after 15 minutes with a message that the tool may still have run.
  `COMPOSIO_WEB_URL` must be an `https://` URL with no credentials, query
  string, or fragment (`http://` is accepted only for localhost); otherwise
  `composio execute` fails before sending anything.

- When telemetry is enabled, `composio execute` sends the CLI's anonymous
  analytics install ID (the random UUID in `~/.composio/analytics.json`) to the
  Composio Dashboard in an `x-cli-install-id` header, so Dashboard-side product
  analytics can be joined with the CLI's own events. It follows the existing
  telemetry opt-outs (`COMPOSIO_CLI_TELEMETRY_DISABLED`, `TELEMETRY_DISABLED`,
  `COMPOSIO_DISABLE_TELEMETRY`, or `CI`): when telemetry is off, or no install
  ID is stored, the header is not sent. It is never sent to the backend API.

- The CLI now calls the backend you logged in to. `composio login` already
  recorded it as `base_url` in `user_data.json`, but every command replaced it
  with the production default unless `COMPOSIO_BASE_URL` or
  `COMPOSIO_ENVIRONMENT` was set, so a staging login sent its key to production
  and failed with `Invalid or revoked user API key`. Those variables still win
  when set, and the CLI warns on stderr when one sends the stored key to a
  different backend than the one that issued it. A key from
  `COMPOSIO_USER_API_KEY` keeps using the backend the environment selects.
  `composio execute` follows the same rule for the Dashboard it calls, using
  the recorded `web_url`. `composio orgs switch` no longer rewrites the
  recorded backend, and a key from `COMPOSIO_USER_API_KEY` is no longer written
  to `user_data.json`. `composio login --agent` records the backend the
  environment selects, since agents.composio.dev issued its key. A rejected
  user API key now prints how to log in again, naming the backend and
  Dashboard when they are not production's.

- `composio link` and `composio dev connected-accounts link` reword their usage
  and status messages on stderr: the rejected `--auth-config` on the root
  command, a toolkit passed together with `--auth-config`, a missing toolkit,
  `--list` without a toolkit, a missing user id, `--auth-config` without a
  developer project, an incomplete link response, a toolkit whose auth
  Composio does not manage, and the waiting and timeout lines shown while a
  link is pending. Exit codes and the JSON printed on stdout are unchanged.

- The CLI now uses `@composio/client@2.0.0-rc.20` (up from `2.0.0-rc.17`),
  which drops the Stainless resource structure: resource classes, class
  statics, namespace-member types and the `.js`/`.mjs` subpath spellings are
  gone. The CLI's type imports move to the one `@composio/client/resources/*`
  spelling; no command changes.

- API requests now authenticate through the API client's `auth` option (the
  logged-in user's API key, or no credential before login) and name the org and
  project through its `scope`, instead of the CLI placing `x-user-api-key`,
  `x-org-id` and `x-project-id` in default headers. The headers sent are
  unchanged. The CLI no longer keeps a client per API key and project for the
  life of the process, so the user API key is held only by the client making
  the request.

- The API client's deprecation notices are dropped by the CLI's logger instead
  of being turned off in the client. Nothing new is printed.

## 0.4.5

### Patch Changes

- Retry only API reads that are safe to repeat. Mutating calls are sent once,
  including when a request times out after the server may have acted.
- Commands that require login now fail consistently with a usage error.
  Project-resolution failures retain their specific error type.
- Tolerate API response fields the command does not consume while continuing
  to validate fields used for output, credentials, and cached data.
- The CLI now uses `@composio/client@2.0.0-rc.17` (up from `2.0.0-rc.14`). No
  command changes.
- API requests now carry the CLI's product, version and runtime headers through
  the API client's `identity` option instead of default headers. The headers
  sent are unchanged.
- `--user-id` and `--project-name` are now flags of the `composio dev` group,
  accepted before or after the subcommand name (`composio dev --user-id alice
toolkits info gmail` and `composio dev toolkits info gmail --user-id alice`
  both work) and documented once, with one description each, on every `dev`
  page. `dev playground-execute` (including `--parallel`),
  `dev connected-accounts link`, `dev connected-accounts list`,
  `dev toolkits info`, `dev toolkits list`, `dev listen` and
  `dev triggers listen` read them from the group instead of declaring their
  own; `dev logs tools` and `dev logs triggers` read the group's `--user-id` as
  their comma-separated filter. The other `dev` commands still fail with exit 1
  on a flag they cannot honor, now with a usage error naming it instead of an
  unrecognized-flag error: `--project-name` on all of them, `--user-id` on all
  but `dev logs`. `composio dev --mode` rejects both.
  Without `--user-id`, a `dev` command given `--project-name` for another
  project falls back to the global test user instead of the directory's
  `test_user_id`, which belongs to the directory's project:
  `dev playground-execute`, `dev connected-accounts link`,
  `dev toolkits info` and `dev toolkits list`. With neither test user set,
  the missing-user error now points at `--user-id` or `composio login`.
- `composio link --help` now lists `--auth-config`. The root command still
  rejects it, now with the message ``Top-level `composio link` is
consumer-only and does not accept `--auth-config`.`` (exit 1) after the login
  check, where it used to fail as an unrecognized flag.

- `composio execute` no longer rejects tool input for string parameters with
  `format: "binary"` or a non-base64 `contentEncoding`, such as plain text in a
  binary field or hex in a `base16` field. Only `contentEncoding: "base64"` is
  checked as base64.

## 0.4.4

### Patch Changes

- `composio execute` and the `execute()` helper in `composio run` scripts now
  report the Instant charge when a call ran on a Composio instant account
  instead of a linked connection: the result carries an `instantCharge` object
  (`amount`, `currency`, `chargedBy`) and the success line shows
  `instant charge: <amount> USD`. The CLI used to create Tool Router sessions
  without asking for the charge and dropped it from the response, so a billed
  call looked free.
- The CLI now runs on the stable Effect 4 line (`effect@4.0.3`, up from
  `4.0.0-rc.117`). No command changes on purpose. One parsing difference comes
  with the framework: an argument that is a negative number, such as `-5`, is
  now read as a value instead of as a flag.

## 0.4.3

### Patch Changes

- `composio execute` (including meta tools), `composio proxy`, the `proxy()`
  helper in `composio run` scripts, and the custom tool schema lookup in
  `composio search` now fail with a clear error when the call needs user input,
  such as an approval, before it can run. The CLI cannot answer input requests
  yet, and it no longer treats such an answer as a result. The `proxy()` helper
  used to return an empty `200` response for a call that never ran.
- `composio execute` now reads whether a tool succeeded from the `result_type`
  the API returns with every execution, so a tool that ran and failed is
  reported as failed even when the API returns no error text. It used to read a
  failed execution with a `null` error as successful.
- `composio execute` now validates the arguments before it sends the tool
  call, so a call that fails local validation is never run. Validation used to
  race the request, and the tool could execute while the CLI reported a
  validation failure. The cached schema named in the validation error is now
  kept on disk instead of being deleted. A schema the CLI cannot compile no
  longer blocks the call; the server still validates it.
- Generate help from the command definitions, including every supported flag and
  nested command. Remove help levels and the nonexistent `files` help topic.
  Install agent skills with `composio setup skill <claude|codex|openclaw>`
  (optionally `--name <skill-name>`) instead of `--install-skill`.
  Internal diagnostics are hidden framework commands. `--dangerously-allow`
  applies only to `dev triggers disable`; refused developer commands exit nonzero.
  Debug flags after the `run` script boundary now reach the script unchanged.
  `composio execute <slug> --help` now shows command options. Use
  `composio execute <slug> --get-schema` to print that tool's input schema as JSON.
- `composio execute` (including meta tools) and `composio proxy` are never
  retried, so a request that timed out or failed after the backend already
  acted cannot repeat a side effect such as sending the same email twice.
- API requests and command analytics now report CLI product/version, language,
  runtime/version, and the installed API client version separately.
- Remove the experimental local-tools stack: the `local-tools` command group,
  the `local_tools` experimental flag, `LOCAL_*` tool execution, `dev native-ui`,
  and the bundled macOS sidecars (peekaboo, imessage-cli, composio-native-ui).
  Release archives no longer ship `local-tools-binaries/`; `composio upgrade`
  and the installer delete one left by an older install. CI no longer installs
  Swift. Permission prompts always use the browser approval page. A
  stored `local_tools` setting is now listed as an unknown feature and has no
  effect.
- Remove `experimental_subAgent()` (alias `invokeAgent`) from `composio run`.
  Its ACP transport approved every tool call the spawned agent requested, so
  both transports (ACP and the older `claude -p` / `codex exec` one), the output
  MCP server, and the bundled ACP adapters are gone. `execute`, `search`,
  `proxy`, `result.prompt()`, and the `z` / `zod` globals are unchanged. A
  script that still calls the helper fails at that call with a message naming
  the removal; tool calls it made earlier have already taken effect. To keep
  the helper, install an older CLI with the installer:
  `curl -fsSL https://composio.dev/install | COMPOSIO_INSTALL_VERSION=<version> sh`.
  `composio upgrade <older version>` from this CLI is not a way back. A stored
  `experimental_subagent` config key is now ignored and preserved; an invalid
  target used to reset the whole config to defaults. `COMPOSIO_RUN_ACP_ONLY` is
  no longer read and the hidden `--acp-only` flag is gone. Remove `--logs-off`,
  which only canceled `--debug` after sub-agent streaming was removed. Helper
  logs are written to disk; use `--debug` to also print them to stderr. An
  unknown flag placed before inline `run` code is now rejected by name
  (`Unrecognized flag: --x in command composio run`) instead of being executed
  as source; inline source that is exactly one flag-shaped token needs an
  explicit `--`. Release archives keep ten legacy paths (the four root
  `run-subagent-*.mjs` files and six `acp-adapters/*` paths) as intentionally
  empty placeholders so that a CLI installed before this change still passes
  its upgrade verification. No adapter binaries are downloaded or shipped.

## 0.4.2

### Patch Changes

- Every Composio API call now goes through the `@composio/client` 2.0 runtime,
  the same client `@composio/core` uses. Org, project, session-info, and
  consumer lookups gain the client's retries and redirect handling, and API
  error messages now keep a server message even when it carries no suggested
  fix. Creating a project API key during `composio dev init` is never retried,
  so a timed-out request cannot mint a second key.
- Ambient `COMPOSIO_CUSTOM_HEADERS` and `COMPOSIO_LOG_LEVEL` values no longer
  leak into CLI requests or output. Custom HTTP base URLs remain supported
  without an additional environment flag.
- `composio run` now validates binary download URLs returned by the proxy API
  before fetching them. Private, loopback, link-local, and redirect-based SSRF
  targets are blocked, DNS resolutions are pinned to prevent rebinding, and the
  download fails closed when a configured proxy prevents address pinning.
- The plugin hint shown under Claude Code or Codex now reads
  `'composio setup --yes' installs it`, and setup error messages that suggest
  a rerun now include `--yes` too, so an agent following the printed text no
  longer fails on the non-interactive `--yes` requirement. CLI telemetry gains
  `agent_host_env` on every event, a `CLI_PLUGIN_HINT_SHOWN` event, host
  presence signals on `CLI_SETUP_HOST_DETECTED` when a host is not detected,
  and a `failure_reason_code` on `CLI_SETUP_FAILED`.
- The CLI now runs on Effect 4 (`effect@4.0.0-rc.112`). Unrecognized commands and
  flags now print a "Did you mean?" suggestion next to the help text for the command
  that failed to parse, and parse errors for a nested command show that command's
  help instead of the root help. `composio --version`, `composio -v`, and
  `composio version` keep printing the same bare version string.
- `composio generate` now keeps tool and trigger metadata as inert data in
  generated Python and TypeScript sources. Crafted slugs and descriptions can
  no longer inject code into generated modules.
- `composio orgs --help`, `composio signup --help`, the `agent` family pages (signup,
  login, whoami, inbox, claim), and the group help pages for `connections`, `triggers`,
  `artifacts`, and `install` now render the same curated, styled help page as every
  other command family, instead of falling back to the framework's raw flag dump.
  `composio help <command>` is now a supported spelling of command help (`composio help
orgs` shows the same page as `composio orgs --help`, with the same longest-prefix
  fallback for deeper paths); an unknown target fails through the framework parser like
  any other unknown command. The `orgs` description in contextual error help now matches
  the command's actual description.
- `composio listen <slug> --stream` without a path is accepted again and streams
  the whole event payload. It previously failed with
  `Received unknown argument: '--stream='`.
- `composio listen` reports an unknown trigger slug as such. A mistyped slug
  used to fail with a missing-connection error for the toolkit inferred from its
  prefix, or with a generic trigger-creation error when that toolkit already had
  an active account.
- `composio tools info`, and the other `info`, `create`, `enable`, `disable`,
  and `status` commands that share its API error handling, now exit non-zero on
  an API error and print the error when stderr is not a terminal. `composio tools
info <unknown-slug>` used to print nothing and exit 0 when piped.
- Help examples use `SLACK_SEND_MESSAGE` and `SLACK_CHANNEL_MESSAGE_RECEIVED`
  instead of a removed Slack tool slug and a trigger without configuration.

## 0.4.1

### Patch Changes

- `composio upgrade` (and any other command with a long spinner message) no
  longer scrolls endlessly in terminals narrower than that message. The spinner
  printed its line hundreds of times instead of animating in place; live spinner
  text is now clamped to a single terminal row.

## 0.4.0

### Patch Changes

- `composio upgrade` shows download progress. The archive is a few hundred
  megabytes, and the command previously printed `Downloading...` once and then
  said nothing for minutes, which was indistinguishable from a hang. It now
  reports percent and transferred size as the download runs.
- `composio upgrade` downloads roughly half as much. Release archives carried
  all four platforms' `codex-acp` binaries, about 651 MB that the machine
  unpacking them can never execute. Only the binary for the archive's own
  platform is shipped now; the other three remain as empty placeholders so that
  a CLI installed before this change still passes its upgrade verification.
- `composio upgrade` works again from any previously released CLI. Release
  archives had been narrowed to drop the `codex-acp` binaries a machine cannot
  execute, but a CLI installed before that change verifies a downloaded package
  against all four platforms' binaries and rejects one that is missing any of
  them, failing with `Downloaded binary package is incomplete`. Every archive
  names all four paths again.
- Archives are no longer extracted with symbolic links in them. `extract-zip`
  creates a symlink entry without validating its target (CVE-2026-56876), which
  has no fixed release, and anything that later reads the extracted tree can be
  walked out of it. No archive this CLI extracts legitimately contains a
  symlink, so such an entry is now refused before it is written.
- `composio search` now uses schemas returned by Tool Router for dashboard-registered custom MCP tools instead of querying the legacy managed-tool endpoint, which returned 404 for `CUSTOM_*` tool slugs.
- `COMPOSIO_ENVIRONMENT=staging` now opens the staging dashboard at
  `https://staging-dashboard.composio.dev/`.
- `composio dev auth-configs create` now sends custom OAuth credentials and scopes
  in the API's expected shape instead of failing validation.

## 0.3.3

### Patch Changes

- Free-form object arguments now pass CLI tool-input validation and keep their content instead of failing with an unknown-key error. Run `composio upgrade` to install the fixed CLI binary.
- A tool schema the validator cannot interpret is now reported as a schema compile failure naming the cached schema path, instead of as an input error blaming your arguments. This covers a `patternProperties` key that is not a valid regular expression, and a reference inside a `patternProperties` or schema-valued `additionalProperties` subschema that does not resolve.
- Tools belonging to multi-word toolkits now resolve to the right toolkit.
  `composio tools execute GOOGLE_ANALYTICS_RUN_REPORT --account <alias>`
  previously looked for a `google` account instead of a `google_analytics` one,
  because the toolkit was guessed from the text before the first underscore.
  The toolkit is now matched against the known toolkit list, longest prefix
  first. This also corrects the toolkit shown in errors, file uploads, trigger
  listening, and telemetry.
- Session meta tools such as `COMPOSIO_SEARCH_TOOLS` are no longer attributed
  to the `composio_search` toolkit, whose slug their names happen to start
  with. A failed meta call used to suggest linking an app that had nothing to
  do with the call.
- Commands that consult the toolkit catalog more than once now fetch it once.
  `composio tools execute` was downloading the full ~800 KB list up to four
  times per run.
- A cached API request that fails is no longer sent a second time. The caching
  layer treated the request's own failure as a cache failure and retried it,
  so every failed toolkit, tool, or trigger listing cost two round trips and
  twice the wait before reporting the same error.
- Resolving a tool's toolkit no longer downloads the toolkit catalog. The CLI
  ships with the toolkit slugs it knew at build time and remembers any it
  learns since in `known-toolkit-slugs.json`, so `composio tools execute` only
  reaches for the catalog when a slug matches nothing it knows — a toolkit
  released after your CLI version. `FORCE_USE_CACHE` is unaffected.
- Resolving a tool's toolkit now reads what the CLI knows locally once per run
  rather than once per lookup. A single `composio tools execute` resolves the
  same toolkit up to four times — and once per tool with `--parallel` — and
  each of those re-read `known-toolkit-slugs.json`, re-parsed it, and rebuilt
  the lookup table over it. The weekly background refresh now also runs once per
  run instead of rewriting the file after every lookup.
- The background catalog refresh is abandoned after ten seconds. A finished
  command ends when the event loop drains, so a slow network could otherwise
  hold an exiting `composio` process open until the refresh completed.
- Cache files are now written atomically, so an interrupted run can no longer
  leave a truncated `toolkits.json` or `tools.json` behind.

## 0.3.2

### Minor Changes

- The installer (`curl -fsSL https://composio.dev/install | sh`) now configures your shell automatically: `COMPOSIO_INSTALL_SHELL` defaults to `auto`, which infers the login shell from `$SHELL` (zsh, bash, or fish) and always runs idempotent PATH setup for it; `COMPOSIO_INSTALL_SHELL=none` keeps the old install-only behavior for CI, Docker, and dotfile managers. Startup-file setup failures no longer fail the install — the installer keeps the binary, warns, and prints a runnable absolute-path command. `composio install` now reconciles an existing managed PATH block whose bin directory changed (one block per physical file, symlink-aware) and suppresses its boxed restart hint when invoked by the installer, which owns the final message.
- `composio install` gains a `--shell <zsh|bash|fish>` flag that overrides `$SHELL` detection, in preparation for the mise-style installer rewrite. The bin-dir PATH target now resolves through `COMPOSIO_BIN_DIR`, an existing `~/.local/bin/composio`, or the real binary's own directory, in that order, instead of hardcoding `~/.composio`; rc blocks write only a PATH line (the `export COMPOSIO_INSTALL_DIR=...` line is gone, since that variable identifies the install bundle, not the PATH entry point). Bash now always writes the PATH line to a login-mode startup file as well as `~/.bashrc`, so `bash -ilc` (and macOS Terminal.app, which starts a login shell) picks it up: the first existing of `~/.bash_profile` or `~/.bash_login`, or a newly created `~/.bash_profile` when neither exists. A `~/.bash_profile` created this way shadows `~/.profile`, so it is seeded to source it first; `~/.profile` itself is never modified. The restart hint bug is fixed: bash now prints `source ~/.bashrc` instead of the literal string `exec $SHELL`.
- `COMPOSIO_BIN_DIR` is a documented public override: set it to the absolute directory `composio install` should add to `PATH` when the entry point users reach is a shim or symlink rather than the binary itself. See the CLI README for the full resolution order.
- `composio install` now exits non-zero, having written nothing, when it cannot produce a safe PATH line. There are two abort conditions: the resolved bin directory is not absolute, or it contains a character that cannot be embedded in a quoted rc line. A non-zero exit is what makes `install.sh` run its inline PATH fallback, so an aborted run still leaves the user with a working `PATH` — previously the command exited 0 and the fallback never ran.
- The unsafe-character set is narrower than the one first shipped in this entry. The bin dir is only ever written inside double quotes, where `;`, `|`, `&`, `(`, `)`, and `'` are literal — only `` ` ``, `$`, `"`, `\`, newline, carriage return, and the `:` PATH separator abort now. Paths like `/Users/o'brien/.composio` are accepted instead of rejected.
- An rc file that carries the older three-line Composio block (`export COMPOSIO_INSTALL_DIR=...` plus a PATH line derived from it), written by a previous CLI or by `install.sh`'s fallback, is migrated to the current single-line block instead of being treated as configured forever. The stale managed lines are removed where they stood and one refreshed block is appended after the remaining content, so your own lines keep their order and the last-sourced PATH line wins. Re-running the command is still idempotent, and a completions block elsewhere in the file is untouched.
- `composio install` no longer skips the rc write when the bin directory happens to be on the invoking process's `$PATH`. That said nothing about future shells — an ad-hoc `export` or a version-manager shim made the command persist nothing and still report success.
- Note for custom install directories: the rc block no longer records `COMPOSIO_INSTALL_DIR`. If you installed to a custom directory with `COMPOSIO_INSTALL_DIR=... curl ... | bash` and later re-run the install script without re-specifying it, the script installs a second copy under `~/.composio` while your rc `PATH` still points at the old one. Re-specify `COMPOSIO_INSTALL_DIR` when reinstalling, or use `composio upgrade`, which replaces the running binary in place.

### Patch Changes

- Fix Linux `composio upgrade` failures with `ETXTBSY` by staging CLI files in
  the install directory and renaming the executable last. The installer and
  companion repair use the same replacement strategy, and the running binary
  now reports its compiled version when `release-tag.txt` disagrees. Users on
  an affected build must re-run `install.sh` once to install the first fixed
  version.
- Connected-account statuses added by the server no longer break
  `connected-accounts`, `link`, or `listen`. Piped output still strips
  credential fields, and schema warnings no longer print raw response values.
- `composio login --poll` now reports unreadable cache files as I/O errors
  instead of treating them as invalid session data.

## 0.3.1

### Minor Changes

- The CLI now points Claude Code and Codex users to `composio setup` when the
  Composio agent plugin is missing. The hint goes to stderr, appears at most
  once every 24 hours, remains visible in non-TTY agent sessions, and stays
  suppressed inside `composio run` children.
- Telemetry now goes directly to PostHog. This captures `install` and `setup`
  events before login without changing existing opt-outs.
- Telemetry events now include `journey_stage` (`install`, `setup`, `login`,
  `connect`, `execute`, or `other`) and `cli_channel` (`stable` or `beta`).
  `install.sh` also labels `composio install` with
  `invocation_origin: installer`, so script installs can be separated from
  manual runs. npm and Homebrew installs do not pass through `install.sh` and
  therefore have no installer origin.

## 0.3.0

### Patch Changes

- The GitHub release tag is now the only version source for standalone CLI
  binaries. Release builds embed the exact tag version, manual skill
  installation uses that tag, and stable releases can only promote a tested
  beta.

## 0.2.33

### Security

- fc17c37: Security: the CLI's tool file-upload path now enforces the sensitive-file denylist (issue #3746 / GHSA-hp3h-89pf-5q58). Previously `composio execute`/`composio run` read and uploaded any local path a tool argument pointed at — including `~/.ssh/id_rsa`, `~/.aws/credentials`, and `.env` files — enabling credential exfiltration in agentic workflows via prompt injection. The CLI now calls the shared `assertSafeFileUploadPath` guard from `@composio/core` at the lowest-level file read. URLs and `File` objects are unaffected.

  Unlike the core and Python SDKs (which expose a `sensitiveFileUploadProtection` / `sensitive_file_upload_protection` opt-out), the CLI enforces the denylist **unconditionally by design** — the primary attack vector is an agent prompt-injected into supplying its own tool arguments, so a CLI override flag would hand that attacker a trivial bypass. The block error carries CLI-appropriate remediation guidance instead of pointing at the SDK-only flag.

### Minor Changes

- Make headless `composio login` agent-friendly (PRDE-1138): the non-interactive instructions now offer the unattended `composio login --agent` path, and a machine with a stored READY agent identity (`~/.composio/agent.json`) completes plain headless `composio login` unattended by reusing it. Reuse only — a human piping `composio login` still gets the URL + poll instructions and never has an account auto-created.
- a0bef5d: Bump `@composio/client` to `0.1.0-alpha.74`.
- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.

### Patch Changes

- Fix `composio listen` crashing with `TypeError: Object is not a constructor` in compiled release binaries (issue #3918). pusher-js 8.5.0 exports a namespace object (`module.exports = { Pusher }`) instead of the constructor (an undocumented upstream packaging regression, pusher/pusher-js#935, fixed in pusher-js 8.6.0), so the dynamic import's `.default` is not callable under Node or Bun; the realtime service now probes every observed interop shape (including the named `Pusher` export), constructs the client inside `Effect.try`, and fails with a typed error instead of crashing.
- Preserve the original CLI diagnostic when an adjacent source map is malformed or unusable instead of letting optional source-map enrichment abort error capture. Source-map enrichment is now best-effort end to end: a malformed, invalid, or unreadable `.map`, and a valid map pointing at an original source that was never shipped, all degrade to the raw stack location. `captureErrors` can no longer fail.
- Fix source-map resolution on Windows: original source paths are now resolved with the platform path separator instead of a hardcoded `/`, and the `node_modules` filter no longer mistakes directories such as `node_modules_local` for real dependency paths.
- Make `composio version --check` report `checkStatus: "unknown"` when GitHub cannot confirm the latest stable release, preserve the last successful cache on failed refreshes, and avoid racing the command with the startup update check.
- Keep `composio install` guidance visible when its output is captured. The command reports which rc file it changed and how to reload the shell, but suppressed all of it when stderr was not a terminal — so installers, containers, and CI logs saw nothing and users were left with `command not found`. Those lines now fall back to plain, undecorated output.
- Make multi-account selection a stable CLI feature: `execute`, `listen`, and `link --alias` no longer honor the old experimental toggle; `proxy` now accepts `--account <alias|word_id|connected-account-id>`; and duplicate-alias link errors explain how to select the existing account.
- 8467efd: Fix `composio whoami` reporting the API key's home organization after `composio orgs switch`. Session info requests now forward the selected global organization.
- 5f004ff: Drop `COMPOSIO_UPSERT_RECIPE` and `COMPOSIO_GET_RECIPE` from the CLI meta-tool list. These slugs were removed from `@composio/client` (alpha.74), so listing them broke the type-checked CLI build.
- 23f9053: Remove the unused `ansis` dependency from the CLI. Colored output is already handled by `picocolors`, so `ansis` was a dead production dependency that shipped with the package.
- 446c6f6: Fix virtual TypeScript file resolution used by CLI type generation so in-memory imports resolve consistently during transpilation and validation.
- Updated dependencies [552859a]
- Updated dependencies [a0bef5d]
- Updated dependencies [23f9053]
- Updated dependencies [dfd7a08]
- Updated dependencies [507318d]
- Updated dependencies [025a657]
- Updated dependencies [6a4cb54]
- Updated dependencies [4b76dbf]
- Updated dependencies [cbbad15]
  - @composio/core@0.12.0
  - @composio/json-schema-to-zod@0.2.0
  - @composio/ts-builders@0.2.0
  - @composio/cli-keyring@0.2.0
  - @composio/cli-local-tools@0.1.0

## 0.2.32

### Patch Changes

- Updated dependencies [22a9171]
- Updated dependencies [93b67e8]
- Updated dependencies [b69cef1]
- Updated dependencies [1ba66ca]
- Updated dependencies [a94715f]
- Updated dependencies [ce4b213]
- Updated dependencies [44e5458]
  - @composio/core@0.11.0
  - @composio/cli-local-tools@0.0.5

## 0.2.31

### Patch Changes

- `composio upgrade` now accepts an optional `<version>` argument so you can install a specific stable release or beta (e.g. `composio upgrade 0.13.1`, `composio upgrade 0.13.1-beta.42`, or the full tag `@composio/cli@0.13.1`). When omitted, the command continues to install the latest release on the chosen channel (`--beta` for prereleases).
- CLI now sends its per-cwd session id as the `x-cli-session-id` header on every request. The backend uses this to tag tool execution logs with `session_info.cli_session_id`, so all tool executions from a single CLI session (one cwd, one user) can be grouped together in the logs UI.
- Refresh the browser fallback approval prompt with the Composio CLI landing page visual style and serve it from the local loopback callback server while continuing to prefer the native macOS sidecar when available.
- Make CLI output more LLM-friendly by gating human-only notices/prompts on interactive TTYs and keeping logs on stderr.
- Route fish shell completions to `~/.config/fish/completions/composio.fish` (instead of the rc file) and sanitize completion lines that could break parsing.
- Permission "allow" decisions now expire after 1 hour — the prompt action is relabeled "Allow for 1 hr" and cached decisions are pruned on expiry.

## 0.2.30

### Patch Changes

- Updated dependencies [42ebff3]
  - @composio/core@0.10.0
  - @composio/cli-local-tools@0.0.4

## 0.2.29

### Patch Changes

- Updated dependencies [84a3a07]
- Updated dependencies [c358ffa]
  - @composio/core@0.9.1
  - @composio/cli-local-tools@0.0.3

## 0.2.28

### Patch Changes

- 79ac220: Scaffold the CLI local-tools foundation package, wire it into Tool Router search/execute sessions, and expose `composio local-tools list|doctor|configure|meta` for discovery, readiness checks, setup hints, and local metadata state. Concrete app integrations are added in follow-up stack PRs.
- Updated dependencies [79ac220]
- Updated dependencies [79ac220]
- Updated dependencies [79ac220]
- Updated dependencies [c9b6525]
- Updated dependencies [cc673b6]
- Updated dependencies [79ac220]
- Updated dependencies [9f14971]
- Updated dependencies [81f8027]
- Updated dependencies [711a703]
- Updated dependencies [bccd32b]
- Updated dependencies [bccd32b]
- Updated dependencies [07c9bab]
- Updated dependencies [3ece424]
  - @composio/cli-local-tools@0.0.2
  - @composio/core@0.9.0

## 0.2.27

### Patch Changes

- Updated dependencies [6b986cd]
- Updated dependencies [1c3276b]
  - @composio/core@0.8.1

## 0.2.26

### Patch Changes

- Updated dependencies [ebc9778]
- Updated dependencies
  - @composio/core@0.8.0

## 0.2.25

### Patch Changes

- Updated dependencies [27ed0c9]
  - @composio/core@0.6.11

## 0.2.24

Manual version bump to realign with the GitHub release tag. The 0.2.23 release workflow misclassified the version-bump merge as a beta due to a shallow-checkout bug in `.github/workflows/build-cli-binaries.yml`, so binaries built from that commit landed on `@composio/cli@0.2.24-beta.209` and, after `promote-stable`, on the GitHub tag `@composio/cli@0.2.24`. npm was left at 0.2.23. This release bumps npm to 0.2.24 so the published package and the GitHub release match. Fix for the underlying workflow bug: #3212.

## 0.2.23

### Patch Changes

- 4df06d2: feat: add `simple`, `default`, and `verbose` help verbosity modes to root and subcommand help (`--help simple|verbose`); compact simple mode and richer verbose mode with additional commands (#3205)
  feat: add `composio connections list` command that groups connected accounts by toolkit and displays aliases (#3206)
  feat: migrate API key storage from plaintext `~/.composio/user_data.json` to OS keyring (macOS Keychain / Linux Secret Service); env var > keyring > legacy plaintext precedence with one-shot migration and `dangerouslySaveApiKeyInUserConfig` opt-out for headless environments (#3202)
  feat: turn `composio dev` into a real developer-mode toggle backed by CLI user config; gate the `init`, `tools execute`, `triggers listen`, `logs`, `toolkits`, `auth-configs`, `connected-accounts`, `triggers`, and `projects` subcommand tree behind the toggle, and remove deprecated destructive `delete`/`info` commands now covered by the dev-mode gate (#3181)
  feat: enable `multi_account` experimental feature by default for stable CLI builds and centralize default experimental-feature behavior so runtime config and skill reference schema stay in sync (#3163)

## 0.2.22

### Patch Changes

- Updated dependencies [670ecc9]
  - @composio/core@0.6.10

## 0.2.21

### Patch Changes

- Updated dependencies [5b5723a]
  - @composio/core@0.6.9

## 0.2.20

### Patch Changes

- 4e36db8: feat: add `composio listen` command for real-time trigger event monitoring
  feat: add top-level `composio triggers` command (list, info subcommands)
  fix: pre-existing CI failures across CLI and e2e suites
  docs: document `--file` support for CLI skill uploads

## 0.2.19

### Patch Changes

- Updated dependencies [2b19ae9]
  - @composio/core@0.6.8

## 0.2.18

### Patch Changes

- f49e0af: feat: add `--beta` flag to `composio upgrade` for prerelease channel support
  feat: preload custom auth connections into tool router sessions for seamless custom-auth toolkit execution
  improve: beta-channel CLI release promotion flow in CI workflow
  improve: expanded test coverage for upgrade binary and custom auth session creation

## 0.2.17

### Patch Changes

- e3322e6: fix: hydrate file_uploadable tool inputs and add temp-file handling for execute payloads
  fix: surface in-band tool errors as warnings without overriding successful execution results
  fix: resolve 8 TypeScript strict-mode errors blocking CLI build in run-helpers-runtime
  refactor: extract run helper runtime (~650 lines) from run.cmd.ts into run-helpers-runtime.ts

## 0.2.16

### Patch Changes

- b763753: fix: bundle bun support files into CLI binary so standalone builds work without external bun dependencies

## 0.2.15

### Patch Changes

- 51c4e09: fix: bundle MCP server into subagent helper via static imports so it works with standalone CLI binaries without repo-local node_modules; fix codact failures not being reported by dispatching them through a dedicated background worker and wiring up the `tools execute` command to capture wrong-slug and wrong-param failures

## 0.2.14

### Patch Changes

- 5a3c661: Change `composio install` to skip shell completions by default and require `--completions` to install them explicitly. Also keep the skipped-completions logging consistent.

## 0.2.13

### Patch Changes

- cb02575: fix(cli): harden run subagent structured output and logfile path propagation

## 0.2.12

### Patch Changes

- 2eee65d: patch

## 0.2.11

### Patch Changes

- 77904b0: Fix link behavior, disable caching, improve search steps

## 0.2.10

### Patch Changes

- b301069: ### Bug fixes & hardening
  - Fix no-browser link flow to print raw redirect URLs
  - Harden session artifacts, analytics dir creation, and consumer cache for sandboxed environments (wrap filesystem ops in try/catch, respect `COMPOSIO_SESSION_DIR` / `COMPOSIO_CACHE_DIR` env vars)
  - Fix stale/broken symlink handling in skill installer (use `lstatSync` instead of `existsSync`)
  - Fix `detectMaster` parameter type to avoid type conflict from bun env augmentation

  ### New features
  - Add parallel execute support and help examples
  - Add batched multi-query tool search
  - Allow `execute --get-schema` without user context
  - Cache no-auth toolkits as connected
  - Report execute failure origin and tool log IDs
  - Add skill installer during `composio login` (with `--no-skill-install` opt-out)
  - Add contextual help on CLI errors and unknown arguments
  - Add `composio files` subcommand help and richer examples in root help output

## 0.2.9

### Patch Changes

- 315238c: - Add telemetry worker and improve tool execution UX
  - Fix `composio link` hanging after auth completes
  - Add parallel tool execution support
  - Add ACP-backed subagent execution to `composio run`
  - Move CLI manage commands under `dev` namespace
  - Update CLI copy

## 0.2.8

### Patch Changes

- ae08b37: - Make top-level `composio search`, `composio link`, and `composio execute` consumer-only
  - Keep developer-scoped usage under `composio manage ...`
  - Remove developer-only flags from root help and add short related-command hints
  - Use `consumer_user_id` from consumer project resolve for consumer flows
  - Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
  - Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)
- Updated dependencies [8dc5568]
  - @composio/core@0.6.7

## 0.2.7

### Patch Changes

- 106618b: - Make top-level `composio search`, `composio link`, and `composio execute` consumer-only
  - Keep developer-scoped usage under `composio manage ...`
  - Remove developer-only flags from root help and add short related-command hints
  - Use `consumer_user_id` from consumer project resolve for consumer flows
  - Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
  - Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)

## 0.2.6

### Patch Changes

- Updated dependencies [e1f6516]
  - @composio/core@0.6.6

## 0.2.5

### Patch Changes

- a5be528: Cli release with changes in command scopes

## 0.2.4

### Patch Changes

- 67867ae: Add login flags for agent/auth flows: `--no-wait` (print URL/session info and exit), `--key` (complete login with session key; polls until linked unless `--no-wait` is also passed)

## 0.2.3

### Patch Changes

- Updated dependencies [476d451]
- Updated dependencies
  - @composio/core@0.6.5

## 0.2.2

### Patch Changes

- 25c3246: CLI v0.2.2: interactive login picker, --no-wait for link, whoami security

  ### What's New
  - **Interactive org/project picker** after `composio login` (use `-y` to skip)
  - **`--no-wait`** flag for `composio link` — print URL/JSON and exit without waiting
  - **Whoami** no longer exposes API keys (security improvement)

  ### Breaking Changes
  - Removed `--api-key`, `--org-id`, `--project-id` from `composio login` and `composio init`
  - Non-interactive login/init via flags is no longer supported; use browser flow with `-y` for login

## 0.2.1

### Patch Changes

- ecb455c: Fix CTAs and Link commands

## 0.2.0

### Minor Changes

- c35b38b: Add top-level command aliases, restructure root help with BASIC/ADVANCED sections, and show full usage/options for basic commands

## 0.1.35

### Patch Changes

- Updated dependencies [e3f1f6c]
  - @composio/core@0.6.4

## 0.1.34

### Patch Changes

- 3d74f52: Added compact gh-style root help for composio --help and fixed the project environment detector empty-directory test on macOS. Updated root help copy (tagline, login/logout, generate) and resolved the CI typecheck failure in bin.ts.

## 0.1.33

### Patch Changes

- 5890693: Add a new commands for CLI org switching and project switching

## 0.1.32

### Patch Changes

- 9ebaac5: Fallback to gloabl user_id if project user_id is not present

## 0.1.31

### Patch Changes

- 6db8463: Skip user api key from env

## 0.1.30

### Patch Changes

- 5015210: Fallback to global context if project apikeys not found

## 0.1.29

### Patch Changes

- 7b47f35: Fix cli login command

## 0.1.28

### Patch Changes

- 2bd2db4: Update tool search and API key inference

## 0.1.27

### Patch Changes

- 25a3898: Fix test installation

## 0.1.26

### Patch Changes

- dfb07f2: BUmp cli version to enable new release flow

## 0.1.25

### Patch Changes

- d7dfa62: Upgrade the new CLI with composio flows
