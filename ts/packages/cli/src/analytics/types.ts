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

export type CliCommandTelemetryContext = {
  readonly argv: ReadonlyArray<string>;
  readonly cliVersion: string;
  /** Who invoked this CLI process (`cli`, `run`, `installer`, …). */
  readonly invocationOrigin: string;
  /** Run id of the `composio run` that spawned this process, when there is one. */
  readonly parentRunId: string | undefined;
  readonly commandPath: string;
  readonly flagNames: ReadonlyArray<string>;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly startedAt: number;
  readonly runId?: string;
  readonly toolkitSlug?: string;
};
