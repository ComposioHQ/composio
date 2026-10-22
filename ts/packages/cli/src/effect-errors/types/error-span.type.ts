// v4 has no `Span` object to walk for attributes/timing on a `Cause` (see
// `logic/errors/span-annotation.ts`) — only the span name and its call-site
// location survive the `Cause.StackTrace` reason annotation, so `ErrorSpan`
// carries just those two fields now.
export interface ErrorSpan {
  readonly name: string;
  readonly location: string | undefined;
}
