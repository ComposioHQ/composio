export interface ErrorSpan {
  name: string;
  attributes: Record<string, unknown>;
  durationInMilliseconds: number | undefined;
  startTime: bigint;
  endTime: bigint | undefined;
}
