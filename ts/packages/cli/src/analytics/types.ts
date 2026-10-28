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
   * The input argument the family's events describe, from the input `effect/cli` parsed: the tool
   * slug of `execute`, the first query of `search`, the toolkit of `link`, the endpoint of
   * `proxy`. Unset for other families and when nothing was parsed (help, version, parse errors).
   */
  readonly argument?: string;
  readonly flagNames: ReadonlyArray<string>;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly startedAt: number;
  readonly runId?: string;
  readonly toolkitSlug?: string;
};
