import { Data } from 'effect';

export class ListenCommandError extends Data.TaggedError('commands/ListenCommandError')<{
  readonly reason:
    | 'project_context'
    | 'connected_accounts'
    | 'connected_account_not_found'
    | 'unknown_trigger'
    | 'create_trigger'
    | 'disable_trigger';
  readonly message: string;
  readonly slug?: string;
  readonly toolkitSlug?: string;
  readonly cause?: unknown;
}> {}
