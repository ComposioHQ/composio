import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { resolveCommandProject, type ResolvedCommandProject } from 'src/services/command-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import {
  ABORTED_MESSAGE,
  CONFIRM_PRINT_CREDENTIALS_MESSAGE,
  NO_API_KEY_MESSAGE,
  formatDebugApiInfo,
} from './debug.api-info.format';

const debugError = commandInputError('debug');

/** Only a consumer project carries the playground user the API key acts for. */
export const consumerUserIdOf = (project: Option.Option<ResolvedCommandProject>): string | null =>
  project.pipe(
    Option.filter(resolved => resolved.projectType === 'CONSUMER'),
    Option.flatMapNullishOr(resolved => resolved.consumerUserId),
    Option.getOrNull
  );

/**
 * The consumer project, when there is one. A project the user has not set up yet is a legitimate
 * "none" here; a failed lookup is not, and keeps its typed error so the invocation prints it and exits
 * non-zero.
 */
const resolveConsumerProject = resolveCommandProject({ mode: 'consumer' }).pipe(
  Effect.map(Option.some),
  Effect.catchTag('services/ProjectResolutionError', error =>
    error.reason === 'missing_org' || error.reason === 'missing_developer_project'
      ? Effect.succeed(Option.none<ResolvedCommandProject>())
      : Effect.fail(error)
  )
);

/**
 * Prints the CLI's API key, current org, and consumer user id as JSON, after the user confirms.
 * Nothing gates the command on login, so a missing key is reported here.
 */
export const runDebugApiInfo = () =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const confirmed = yield* ui.confirm(CONFIRM_PRINT_CREDENTIALS_MESSAGE, { defaultValue: false });
    if (!confirmed) {
      return yield* debugError(ABORTED_MESSAGE);
    }
    const ctx = yield* ComposioUserContext;
    const apiKey = yield* Effect.fromOption(
      Option.filter(ctx.data.apiKey, key => key.length > 0),
      () => debugError(NO_API_KEY_MESSAGE)
    );
    const consumerProject = yield* resolveConsumerProject;
    yield* ui.output(
      formatDebugApiInfo({
        apiKey,
        orgId: Option.getOrNull(ctx.data.orgId),
        consumerUserId: consumerUserIdOf(consumerProject),
      }),
      { force: true }
    );
  });
