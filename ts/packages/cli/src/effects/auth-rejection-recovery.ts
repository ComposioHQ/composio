import { Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { type AuthRejection, AuthRejectionRecorder } from 'src/services/auth-rejection';
import { isInteractivePermissionUiDisabled } from 'src/services/native-ui-sidecar';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import {
  type BackendResolution,
  type BackendTarget,
  backendHost,
  currentLoginBackend,
  loginCommandForBackend,
} from 'src/utils/backend-resolution';

export type AuthRejectionRecovery =
  | { readonly kind: 'message'; readonly message: string; readonly nextStep: string }
  | {
      readonly kind: 'offer-relogin';
      readonly target: BackendTarget;
      readonly message: string;
      readonly nextStep: string;
    };

/**
 * Decide how to report a rejected key: which message, and whether a re-login
 * can be offered. Re-login needs the stored key, no env override pointing
 * elsewhere, and a real interactive session outside CI and `composio run`.
 */
export const decideAuthRejectionRecovery = (params: {
  readonly rejection: AuthRejection;
  readonly backend: BackendResolution;
  readonly canPromptForLogin: boolean;
  readonly invocationOrigin: string | undefined;
}): AuthRejectionRecovery => {
  const { rejection, backend } = params;
  const host = backendHost(rejection.baseURL);

  if (rejection.keySource === 'env') {
    return params.invocationOrigin === 'run'
      ? {
          kind: 'message',
          message: `The Composio API at ${host} rejected the API key \`composio run\` passed to this command.`,
          nextStep: `Run \`${loginCommandForBackend(rejection.baseURL)}\`, then re-run the script.`,
        }
      : {
          kind: 'message',
          message: `The Composio API at ${host} rejected the API key in COMPOSIO_USER_API_KEY.`,
          nextStep: 'Replace its value with a valid user API key.',
        };
  }

  if (backend.mismatch && backend.stored !== undefined && backend.overrideVariable) {
    return {
      kind: 'message',
      message: `The Composio API at ${host} rejected your stored API key: ${backend.overrideVariable} points the CLI at ${host}, but you logged in to ${backendHost(backend.stored.baseURL)}.`,
      nextStep: `Unset ${backend.overrideVariable} to use that login.`,
    };
  }

  const target = currentLoginBackend(backend);
  const message = `The Composio API at ${host} rejected your stored API key.`;
  const nextStep = `Run \`${loginCommandForBackend(target.baseURL)}\` to log in again, then re-run the command.`;
  return params.canPromptForLogin && params.invocationOrigin !== 'run'
    ? { kind: 'offer-relogin', target, message, nextStep }
    : { kind: 'message', message, nextStep };
};

const printRejection = (recovery: { readonly message: string; readonly nextStep: string }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    if ((yield* ui.capabilities).canDecorate) {
      yield* ui.log.error(recovery.message);
      yield* ui.log.step(recovery.nextStep);
    } else {
      // Agents and CI capture stderr; the next step must reach them undecorated.
      yield* ui.error(`${recovery.message} ${recovery.nextStep}`);
    }
  });

/**
 * Report the first recorded key rejection once, after the command finished.
 * `relogin` must store new credentials only after it fully succeeds; any
 * failure leaves the stored login untouched.
 */
export const reportAuthRejection = <E, R>(params: {
  readonly relogin: (target: BackendTarget) => Effect.Effect<void, E, R>;
}) =>
  Effect.gen(function* () {
    const recorder = yield* AuthRejectionRecorder;
    const rejection = yield* recorder.first;
    if (Option.isNone(rejection)) return;

    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const { canPrompt } = yield* ui.capabilities;
    const promptDisabled = yield* isInteractivePermissionUiDisabled;
    const invocationOrigin = yield* APP_CONFIG.CLI_INVOCATION_ORIGIN.pipe(
      Effect.orElseSucceed(() => undefined)
    );

    const recovery = decideAuthRejectionRecovery({
      rejection: rejection.value,
      backend: ctx.backend,
      canPromptForLogin: canPrompt && !promptDisabled,
      invocationOrigin,
    });

    if (recovery.kind === 'message') {
      return yield* printRejection(recovery);
    }

    yield* ui.log.error(recovery.message);
    const host = backendHost(recovery.target.baseURL);
    const accepted = yield* ui
      .confirm(`Log in again to ${host}?`, { defaultValue: true })
      .pipe(Effect.orElseSucceed(() => false));
    if (!accepted) {
      return yield* ui.log.step(recovery.nextStep);
    }

    yield* params.relogin(recovery.target).pipe(
      Effect.matchCauseEffect({
        onSuccess: () => ui.log.success(`Logged in again to ${host}. Re-run the command.`),
        onFailure: cause =>
          Effect.logDebug('Re-login failed:', cause).pipe(
            Effect.andThen(
              ui.log.warn(
                `Login did not complete. Your stored credentials are unchanged. ${recovery.nextStep}`
              )
            )
          ),
      })
    );
  });
