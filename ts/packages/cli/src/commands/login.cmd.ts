import { Command, Options } from '@effect/cli';
import { Effect, Option, Schedule } from 'effect';
import open from 'open';
import {
  ComposioSessionRepository,
  getSessionInfo,
  type SessionInfoResponse,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { ProjectKeyRegistry } from 'src/services/project-key-registry';
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
 * Resolves TerminalUI, ComposioUserContext, and ProjectKeyRegistry from the
 * Effect context rather than accepting them as parameters -- this keeps the
 * signature focused on data and avoids hand-rolled structural types.
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
    const registry = yield* ProjectKeyRegistry;

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
    const orgId = sessionInfo?.org_member.id ?? initialOrgId;
    const projectId = sessionInfo?.project.id ?? initialProjectId;

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

    // Store UAK in user_data.json
    yield* ctx.login(uakApiKey);

    // Register org+project in global registry.
    // The linked session's id IS the project ID, and account.id IS the org member ID.
    // When session/info succeeds, we enrich with project/org names.
    yield* registry.register({
      orgId,
      projectId,
      projectName: Option.fromNullable(sessionInfo?.project.name ?? null),
      orgName: Option.fromNullable(sessionInfo?.project.org.name ?? null),
      email: Option.fromNullable(sessionInfo?.org_member.email ?? fallbackEmail ?? null),
    });

    const email = sessionInfo?.org_member.email ?? fallbackEmail;
    yield* ui.log.success(`Logged in with user account ${email}`);
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
      const registry = yield* ProjectKeyRegistry;

      yield* ui.intro('composio login');

      // Non-interactive path: --api-key, --org-id, --project-id flags skip browser flow.
      // Strict verification: 400/401/403 from session/info are hard failures since
      // the user explicitly provided the IDs.
      if (Option.isSome(apiKey) && Option.isSome(orgId) && Option.isSome(projectId)) {
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
        // Allow re-login when no _keys/ registry exists (old CLI login without multi-project support)
        const existingProfiles = yield* registry.listAll();
        if (existingProfiles.length > 0) {
          yield* ui.log.warn(`You're already logged in!`);
          yield* ui.log.info(
            `If you want to log in with a different account, please run \`composio logout\` first.`
          );
          yield* ui.outro('');
          return;
        }
        yield* ui.log.step('Re-authenticating for multi-project support...');
      }

      const client = yield* ComposioSessionRepository;

      yield* Effect.logDebug('Authenticating...');

      const session = yield* client.createSession({ scope: 'user' });

      yield* Effect.logDebug(`Created session: ${session.id}`);

      const url = `${ctx.data.webURL}?cliKey=${session.id}`;

      if (noBrowser) {
        yield* ui.log.info('Please login using the following URL:');
      } else {
        yield* ui.log.step('Redirecting you to the login page');
      }

      yield* ui.note(url, 'Login URL');
      yield* ui.output(url);

      if (!noBrowser) {
        yield* Effect.tryPromise(() => open(url, { wait: false })).pipe(
          Effect.catchAll(error =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to open browser:', error);
              yield* ui.log.warn('Could not open the browser automatically.');
              yield* ui.log.info(
                `Tip: try using \`composio login --no-browser\` and open the URL manually.`
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

      // The linked session contains the correct identifiers:
      // - linkedSession.id → x-project-id (the session ID doubles as project ID)
      // - linkedSession.account.id → x-org-id (the account ID is the org member ID)
      // Non-strict: session/info errors are non-fatal since the session is already linked.
      yield* storeCredentials({
        baseURL: ctx.data.baseURL,
        uakApiKey: linkedSession.api_key,
        initialOrgId: linkedSession.account.id,
        initialProjectId: linkedSession.id,
        fallbackEmail: linkedSession.account.email,
        strictVerification: false,
      });
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
