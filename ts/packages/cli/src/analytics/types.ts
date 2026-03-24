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
  readonly commandPath: string;
  readonly flagNames: ReadonlyArray<string>;
  readonly startedAt: number;
  readonly runId?: string;
};
