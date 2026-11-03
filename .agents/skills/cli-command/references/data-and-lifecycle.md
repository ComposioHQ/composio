# Command data and lifecycle

## Producing and consuming data

[TerminalUI](../../../../ts/packages/cli/src/services/terminal-ui.ts) owns terminal output and prompts. Each stream reports whether it is attached to a terminal through `isTTY`. The three stream capabilities are independent.

| Concern                | Current behavior                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Machine data           | `ui.output(text)` writes a newline to redirected stdout. Visible TTY stdout stays silent unless `{ force: true }` is set. |
| Human decoration       | `ui.log`, `note`, `intro`, `outro`, and spinners use stderr and disappear when stderr is not a TTY.                       |
| Persistent diagnostics | `ui.error(text)` writes to stderr even when redirected. It also carries protocol metadata such as `RUN_LOG_FILE`.         |
| Prompts                | `canPrompt` requires both stdin and stderr to be TTYs. Piping stdout alone does not disable prompts.                      |

A command serializes its machine result before calling `output`. A command without a separate human renderer uses `force: true` when its data must remain visible on a terminal. Output consumers must follow that command's contract. `proxy` can return text or JSON, while listeners emit a stream rather than one JSON document.

[resolveOptionalTextInput](../../../../ts/packages/cli/src/effects/resolve-optional-text-input.ts) handles a literal string, `@file`, explicit `-` for stdin, or implicit piped stdin when no value is supplied. A file or explicit value takes precedence over implicit stdin. The helper returns text or the configured missing-value fallback. The command validates supplied data with its own parser and schema before using it.

[Stdin.readAll](../../../../ts/packages/cli/src/services/stdin.ts) buffers size-limited input until end of input (EOF). It is not a reader for an unlimited event stream. A producer that never closes stdin keeps the command waiting. `TestLive({ stdin: { isTTY: false, data: '...' } })` supplies finite test input without consuming the test runner's stdin.

## Commands that do more than request and print

| Command               | Behavior that changes the implementation approach                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listen`              | A realtime subscription can run indefinitely without `--timeout` or `--max-events`. It writes payload files and an `events.jsonl` index, and emits status and event lines. `--stream` also emits inline payload values. |
| `dev triggers listen` | A long-lived listener can append to an output file or forward events to a URL. Each sink can fail independently.                                                                                                        |
| `run`                 | A child process inherits stdin, stdout, and stderr. Arbitrary script output is not a CLI JSON result. The command announces a log path on stderr and preserves the child's exit outcome.                                |
| `proxy`               | A successful proxy operation can contain an upstream HTTP error response. The command's exit code alone does not establish an upstream success status.                                                                  |

The [listen handler](../../../../ts/packages/cli/src/commands/listen/listen.handler.ts) uses scoped event fibers and `acquireUseRelease` for temporary-trigger cleanup. It does not collect the full event stream into memory. Its in-memory event-id set still grows with the subscription, so an agent session needs a bounded duration or event count.

[Sink failure handling](../../../../ts/packages/cli/src/commands/triggers/sink-failures.ts) counts failures and continues by default. The stop summary remains visible on redirected stderr. `--fail-fast` stops on the first sink failure and exits 1. A clean listener exit therefore does not prove every event was saved or forwarded. On a count or timeout stop, accepted event work gets a bounded drain. A signal stop interrupts active event fibers before release, so it does not guarantee that every accepted write completed.

## Ctrl+C, Ctrl+D and cleanup

The [runner](../../../../ts/packages/cli/src/run-main.ts) owns SIGINT, SIGTERM, and SIGHUP. Handlers cooperate through [ShutdownSignal](../../../../ts/packages/cli/src/services/shutdown-signal.ts). Resource cleanup belongs in scoped Effects and finalizers.

| Situation                                               | Result                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ctrl+C interrupts a normal command                      | An interruption-only outcome after SIGINT exits 130. SIGTERM and SIGHUP use 143 and 129.                                                                           |
| A subscribed listener receives Ctrl+C or SIGTERM        | It cooperates and normally exits 0 after release. Before subscription confirmation, interruption still uses 130 or 143.                                            |
| `run` receives a stop signal                            | It forwards the signal to its child process group and mirrors how the child ends. A child that handles the signal can exit 0.                                      |
| A second signal arrives, or shutdown exceeds 10 seconds | The runner forces termination. Finalizers are not guaranteed to complete.                                                                                          |
| A finite stdin read receives EOF                        | `Stdin.readAll()` returns the buffered input. In a Unix terminal in cooked mode, Ctrl+D on an empty input line produces EOF. It is not a process-wide stop signal. |
| Clack reports prompt cancellation                       | `confirm` returns false. `select` returns the first option. Ctrl+D has no CLI-wide cancellation contract in raw prompts and is not a substitute for Ctrl+C.        |

When prompting is unavailable, `confirm` returns its configured default, which is true if omitted. `select` returns the first option. A handler must not treat either fallback as a person's explicit approval. Destructive commands need an explicit noninteractive policy, as in `connections remove --yes`.

## Recovery for agents

A parsed, authenticated invocation can still fail after a remote action took effect. [Idempotent request options](../../../../ts/packages/cli/src/services/composio-request.ts) enable retries only for calls known to be safe to repeat. An agent checks remote state before repeating a create, delete, execution, or proxy action after a timeout or interruption.

A recovery flow keeps stdout and stderr separate, inspects the exit outcome, and applies the command's output contract. A nonzero exit can still accompany useful execution JSON. A zero listener exit can accompany sink-failure diagnostics. For `run`, the child script defines the meaning of its output and exit status.

After a listener is force-killed, temporary-trigger cleanup and accepted writes may be incomplete. Existing payload files and the stop diagnostics are evidence, not proof of complete delivery. Prompt defaults, EOF, and a clean shutdown do not authorize an agent to infer that a requested side effect succeeded.
