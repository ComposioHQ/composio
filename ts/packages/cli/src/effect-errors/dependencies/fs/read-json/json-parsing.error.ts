import { TaggedError } from 'effect/Data';

export class JsonParsingError extends TaggedError('json-parsing-error')<{
  cause?: unknown;
  message?: string;
}> {}
