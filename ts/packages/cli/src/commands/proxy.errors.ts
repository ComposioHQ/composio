import { Data } from 'effect';

export class ProxyCommandError extends Data.TaggedError('commands/ProxyCommandError')<{
  readonly reason: 'missing_consumer_user' | 'toolkit_not_connected';
  readonly message: string;
  readonly toolkit?: string;
  readonly endpoint?: string;
}> {}
