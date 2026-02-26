import { Command, Options } from '@effect/cli';
import { Effect, Option, Schedule } from 'effect';
import open from 'open';
import {
  ComposioSessionRepository,
  getSessionInfo,
  getSessionInfoByUserApiKey,
  type SessionInfoResponse,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

export const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Login without browser interaction')
);

const apiKeyOpt = Options.text('api-key').pipe(
  Options.optional,
  Options.withDescription('API key for non-interactive login (agents/CI)')
);

const orgIdOpt = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID for non-interactive login')
);

const projectIdOpt = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID for non-interactive login')
);

/**
 * Verifies credentials via session/info and stores them.
 *
 * Resolves TerminalUI and ComposioUserContext from the Effect context rather
 * than accepting them as parameters -- this keeps the signature focused on
 * data and avoids hand-rolled structural types.
 */
const storeCredentials = (params: {
  baseURL: string;
  uakApiKey: string;
  initialOrgId: string;
  initialProjectId: string;
  fallbackEmail: string;
  /**
   * When true, 400/401/403 from session/info will fail the login.
   * Used for non-interactive login where the user provides explicit IDs.
   * When false, all session/info errors are non-fatal (browser login).
   */
  strictVerification: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    const {
      baseURL,
      uakApiKey,
      initialOrgId,
      initialProjectId,
      fallbackEmail,
      strictVerification,
    } = params;

    // Call session/info to enrich the login with org/project metadata.
    // In strict mode (non-interactive login), 400/401/403 are hard failures.
    // In non-strict mode (browser login), all errors are non-fatal since
    // the linked session is already authenticated.
    const sessionInfo: SessionInfoResponse | undefined = yield* getSessionInfo({
      baseURL,
      apiKey: uakApiKey,
      orgId: initialOrgId,
      projectId: initialProjectId,
    }).pipe(
      Effect.catchTag('services/HttpServerError', e =>
        Effect.gen(function* () {
          if (strictVerification && e.status && e.status >= 400 && e.status < 500) {
            return yield* Effect.fail(e);
          }
          yield* Effect.logDebug(`Session info fetch failed (HTTP ${e.status ?? '?'}):`, e);
          return undefined;
        })
      ),
      Effect.catchTag('services/HttpDecodingError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Session info decoding error:', e);
          return undefined;
        })
      )
    );

    // Use session/info as the canonical source of org/project IDs when available.
    // The initial IDs come from the linked session response (which may use session-level
    // identifiers rather than the actual org/project IDs).
    const orgId = sessionInfo?.project.org.id ?? initialOrgId;
    const projectId = sessionInfo?.project.nano_id ?? initialProjectId;

    if (sessionInfo) {
      if (initialOrgId !== orgId) {
        yield* Effect.logDebug(`orgId corrected: ${initialOrgId} -> ${orgId} (from session/info)`);
      }
      if (initialProjectId !== projectId) {
        yield* Effect.logDebug(
          `projectId corrected: ${initialProjectId} -> ${projectId} (from session/info)`
        );
      }
    }

    // Store UAK + org/project IDs in user_data.json
    yield* ctx.login(uakApiKey, orgId, projectId);

    const email = sessionInfo?.org_member.email || fallbackEmail || undefined;
    yield* ui.log.success(email ? `Logged in as ${email}` : 'Logged in successfully');
    yield* ui.log.info('Run `composio init` in your project directory to set up project context.');

    // Emit structured JSON for piped/scripted consumption (agent-native)
    yield* ui.output(
      JSON.stringify({
        email,
        org_id: orgId,
        project_id: projectId,
        org_name: sessionInfo?.project.org.name ?? '',
        project_name: sessionInfo?.project.name ?? '',
      })
    );

    yield* ui.outro("You're all set!");
  });

/**
 * Runs the browser-based login flow: creates a CLI session, opens the browser,
 * polls until linked, enriches via session/info, and stores credentials.
 *
 * Shared by `composio login` (scope: 'user') and `composio init` (scope: 'project').
 *
 * Resolves TerminalUI, ComposioUserContext, and ComposioSessionRepository
 * from the Effect context.
 */
export const browserLogin = (params: {
  /** Session scope: 'user' for login, 'project' for init. */
  scope: 'user' | 'project';
  /** When true, don't open browser — just show the URL. */
  noBrowser: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const client = yield* ComposioSessionRepository;

    yield* Effect.logDebug(`Authenticating (scope: ${params.scope})...`);

    const session = yield* client.createSession({ scope: params.scope });

    yield* Effect.logDebug(`Created session: ${session.id}`);

    const url = `${ctx.data.webURL}?cliKey=${session.id}`;

    if (params.noBrowser) {
      yield* ui.log.info('Please login using the following URL:');
    } else {
      yield* ui.log.step('Redirecting you to the login page');
    }

    yield* ui.note(url, 'Login URL');
    yield* ui.output(url);

    if (!params.noBrowser) {
      yield* Effect.tryPromise(() => open(url, { wait: false })).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Failed to open browser:', error);
            yield* ui.log.warn('Could not open the browser automatically.');
            yield* ui.log.info(
              `Tip: try using the \`--no-browser\` flag and open the URL manually.`
            );
          })
        )
      );
    }

    const linkedSession = yield* ui.useMakeSpinner('Waiting for login...', spinner =>
      Effect.retry(
        Effect.gen(function* () {
          const currentSession = yield* client.getSession({ ...session });
          if (currentSession.status === 'linked') {
            return currentSession;
          }
          return yield* Effect.fail(
            new Error(`Session status is still '${currentSession.status}', waiting for 'linked'`)
          );
        }),
        Schedule.exponential('0.3 seconds').pipe(
          Schedule.intersect(Schedule.recurs(15)),
          Schedule.intersect(Schedule.spaced('5 seconds'))
        )
      ).pipe(
        Effect.tap(() => spinner.stop('Login successful')),
        Effect.tapError(() => spinner.error('Login timed out. Please try again.'))
      )
    );

    yield* Effect.logDebug(`Linked session ID: ${linkedSession.id}`);

    // e.g., "uak_b813ydmoEYdB_xBxGHeW"
    const uakApiKey = linkedSession.api_key;

    const uakSessionInfo = yield* getSessionInfoByUserApiKey({
      baseURL: ctx.data.baseURL,
      userApiKey: uakApiKey,
    });

    // e.g., "pr_xlSR6oN5jIlk"
    const xProjectId = uakSessionInfo.project.nano_id;
    // e.g., "k2OiqRLMdHyM"
    const xOrgId = uakSessionInfo.project.org.id;

    yield* Effect.logDebug('UAK session info:', { xProjectId, xOrgId });

    yield* storeCredentials({
      baseURL: ctx.data.baseURL,
      uakApiKey,
      initialOrgId: xOrgId,
      initialProjectId: xProjectId,
      fallbackEmail: linkedSession.account.email,
      strictVerification: false,
    });
  });

/**
 * CLI command to login using Composio's CLI session APIs.
 *
 * Supports two modes:
 * 1. Browser-based: Opens browser for OAuth flow (default)
 * 2. Non-interactive: Accepts --api-key, --org-id, --project-id flags for agents/CI
 *
 * @example
 * ```bash
 * composio login
 * composio login --no-browser
 * composio login --api-key uak_xxx --org-id org-id --project-id proj-id
 * ```
 */
export const loginCmd = Command.make(
  'login',
  { noBrowser, apiKey: apiKeyOpt, orgId: orgIdOpt, projectId: projectIdOpt },
  ({ noBrowser, apiKey, orgId, projectId }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;

      yield* ui.intro('composio login');

      // Non-interactive path: --api-key, --org-id, --project-id flags skip browser flow.
      // All three must be provided together; partial flags are an error.
      const nonInteractiveFlags = [apiKey, orgId, projectId];
      const anyProvided = nonInteractiveFlags.some(Option.isSome);
      const allProvided = nonInteractiveFlags.every(Option.isSome);

      if (anyProvided && !allProvided) {
        const missing = [
          Option.isNone(apiKey) && '--api-key',
          Option.isNone(orgId) && '--org-id',
          Option.isNone(projectId) && '--project-id',
        ].filter(Boolean);
        yield* ui.log.error(`Missing required flag(s): ${missing.join(', ')}`);
        yield* ui.log.info(
          'Non-interactive login requires all three: --api-key, --org-id, --project-id'
        );
        yield* ui.outro('');
        return;
      }

      // Strict verification: 400/401/403 from session/info are hard failures since
      // the user explicitly provided the IDs.
      if (
        allProvided &&
        Option.isSome(apiKey) &&
        Option.isSome(orgId) &&
        Option.isSome(projectId)
      ) {
        yield* Effect.logDebug('Non-interactive login with provided credentials');
        yield* storeCredentials({
          baseURL: ctx.data.baseURL,
          uakApiKey: apiKey.value,
          initialOrgId: orgId.value,
          initialProjectId: projectId.value,
          fallbackEmail: '',
          strictVerification: true,
        });
        return;
      }

      if (ctx.isLoggedIn()) {
        // Allow re-login when orgId/projectId are not yet set (old CLI login without multi-project support)
        if (Option.isSome(ctx.data.orgId) && Option.isSome(ctx.data.projectId)) {
          yield* ui.log.warn(`You're already logged in!`);
          yield* ui.log.info(
            `If you want to log in with a different account, please run \`composio logout\` first.`
          );
          yield* ui.outro('');
          return;
        }
        yield* ui.log.step('Re-authenticating for multi-project support...');
      }

      yield* browserLogin({ scope: 'user', noBrowser });
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
