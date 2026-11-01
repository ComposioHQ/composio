export type TrackEvent = {
  readonly name: string;
  readonly properties?: Record<string, unknown>;
} | null;

export type AnalyticsEnvelope = {
  readonly event: NonNullable<TrackEvent>['name'];
  readonly properties?: NonNullable<TrackEvent>['properties'];
  readonly sentAt: string;
  readonly source: 'cli';
  readonly distinctId: string;
  readonly installId: string;
};

/**
 * The family of lifecycle events a command reports: `command` is the generic `CLI_COMMAND_*`
 * family, every other one has its own events (`CLI_EXECUTE_*`, `CLI_LINK_*`, …).
 */
export type TelemetryFamily =
  | 'command'
  | 'execute'
  | 'search'
  | 'link'
  | 'login'
  | 'logout'
  | 'proxy'
  | 'run'
  | 'install'
  | 'setup';

/** Explicit projection of parser-owned input; never the full command input object. */
export type CommandTelemetryInput = {
  readonly argument?: string;
  readonly options: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly flagNames: ReadonlyArray<string>;
};

export type CliCommandTelemetryContext = {
  readonly argv: ReadonlyArray<string>;
  readonly cliVersion: string;
  /** Who invoked this CLI process (`cli`, `run`, `installer`, …). */
  readonly invocationOrigin: string;
  /** Run id of the `composio run` that spawned this process, when there is one. */
  readonly parentRunId: string | undefined;
  readonly commandPath: string;
  readonly family: TelemetryFamily;
  /**
   * The safe argument the family's events describe: the tool slug of `execute` or the toolkit
   * of `link`, including shared definitions registered under `dev`. Unset when nothing was
   * parsed (help, version, parse errors) or the command declares no argument projection.
   */
  readonly argument?: string;
  /** Canonical configured telemetry options, never raw argv tokens. Empty without parsed input. */
  readonly flagNames: ReadonlyArray<string>;
  /** Safe option properties projected from parsed input. No credentials, bodies, or script source. */
  readonly options: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly startedAt: number;
  readonly runId?: string;
  readonly toolkitSlug?: string;
};
