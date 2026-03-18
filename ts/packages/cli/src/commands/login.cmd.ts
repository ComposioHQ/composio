import { Command, Options } from '@effect/cli';
import { DateTime, Effect, Option, Schedule } from 'effect';
import open from 'open';
import {
  ComposioSessionRepository,
  getSessionInfo,
  getSessionInfoByUserApiKey,
  type SessionInfoResponse,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { runOrgProjectSelection } from 'src/effects/select-org-project';

export const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Login without browser interaction')
);

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Print login URL and session info, then exit without opening browser or waiting'
  )
);

const keyOpt = Options.text('key').pipe(
  Options.withDescription('Complete login using session key from composio login --no-wait'),
  Options.optional
);

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Skip org/project picker; use session defaults')
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
  /** When true, skip the init/switch hints and outro (shown later after org/project picker). */
  skipHints?: boolean;
  /** When true, skip JSON output (emitted later after org/project picker with final selection). */
  skipOutput?: boolean;
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
      skipHints = false,
      skipOutput = false,
    } = params;

    // Call session/info to enrich the login with org/project metadata.
    // All errors are non-fatal (browser login) since the linked session is already authenticated.
    const sessionInfo: SessionInfoResponse | undefined = yield* getSessionInfo({
      baseURL,
      apiKey: uakApiKey,
      orgId: initialOrgId,
      projectId: initialProjectId,
    }).pipe(
      Effect.catchTag('services/HttpServerError', e =>
        Effect.gen(function* () {
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
    const sessionUserId = sessionInfo?.org_member.user_id ?? sessionInfo?.org_member.id;
    const testUserId = sessionUserId
      ? `pg-test-${sessionUserId}`
      : Option.getOrUndefined(ctx.data.testUserId);

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
    yield* ctx.login(uakApiKey, orgId, projectId, testUserId);

    const email = sessionInfo?.org_member.email || fallbackEmail || undefined;
    yield* ui.log.success(email ? `Logged in as ${email}` : 'Logged in successfully');
    if (!skipHints) {
      yield* ui.log.info(
        'Run `composio init` in your project directory to set up project context.'
      );
      yield* ui.log.info(
        'To switch your default global org/project later, run `composio manage orgs switch`.'
      );
    }

    // Emit structured JSON for piped/scripted consumption (agent-native)
    if (!skipOutput) {
      yield* ui.output(
        JSON.stringify({
          email,
          org_id: orgId,
          project_id: projectId,
          org_name: sessionInfo?.project.org.name ?? '',
          project_name: sessionInfo?.project.name ?? '',
        })
      );
    }

    if (!skipHints) {
      yield* ui.outro("You're all set!");
    }
  });

/**
 * Completes login using an existing session key (from composio login --no-wait).
 * Fetches the session, optionally polls until linked, then stores credentials.
 *
 * When noWait is false: polls until session is linked (same as browser flow).
 * When noWait is true: checks once and fails if not linked.
 */
const loginWithKey = (params: { key: string; noWait: boolean; skipOrgProjectPicker: boolean }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const client = yield* ComposioSessionRepository;

    const getSessionEffect = client
      .getSession({ id: params.key })
      .pipe(
        Effect.catchAll(() =>
          Effect.fail(
            new Error(
              'Session not found or expired. Run `composio login --no-wait` to get a new session.'
            )
          )
        )
      );

    let linkedSession;
    if (params.noWait) {
      const session = yield* getSessionEffect;
      if (session.status !== 'linked') {
        yield* ui.log.error('Login not complete. Open the URL and finish authentication.');
        yield* ui.log.info('Then run `composio login --key <key>` again.');
        return yield* Effect.fail(new Error('Session not yet linked'));
      }
      linkedSession = session;
    } else {
      linkedSession = yield* ui.useMakeSpinner('Waiting for login...', spinner =>
        Effect.retry(
          Effect.gen(function* () {
            const currentSession = yield* getSessionEffect;
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
    }
    const uakApiKey = linkedSession.api_key;

    const uakSessionInfo = yield* getSessionInfoByUserApiKey({
      baseURL: ctx.data.baseURL,
      userApiKey: uakApiKey,
    });

    const xProjectId = uakSessionInfo.project.nano_id;
    const xOrgId = uakSessionInfo.project.org.id;

    const willRunPicker = !params.skipOrgProjectPicker;
    yield* storeCredentials({
      baseURL: ctx.data.baseURL,
      uakApiKey,
      initialOrgId: xOrgId,
      initialProjectId: xProjectId,
      fallbackEmail: linkedSession.account.email,
      skipHints: willRunPicker,
      skipOutput: willRunPicker,
    });

    if (willRunPicker) {
      const result = yield* runOrgProjectSelection({
        apiKey: uakApiKey,
        baseURL: ctx.data.baseURL,
      }).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Org/project picker failed:', error);
            yield* ui.log.warn('Could not load org/project list. Using session defaults.');
            return undefined;
          })
        )
      );
      if (result) {
        const sessionUserId = uakSessionInfo.org_member.user_id ?? uakSessionInfo.org_member.id;
        const testUserId = sessionUserId ? `pg-test-${sessionUserId}` : undefined;
        yield* ctx.login(
          uakApiKey,
          result.org.id,
          result.project.id,
          testUserId ?? Option.getOrUndefined(ctx.data.testUserId)
        );
        yield* ui.log.success(
          `Default org/project set to "${result.org.name}" / "${result.project.name}".`
        );
      }
      const finalOrgId = result?.org.id ?? xOrgId;
      const finalProjectId = result?.project.id ?? xProjectId;
      const finalOrgName = result?.org.name ?? uakSessionInfo.project.org.name ?? '';
      const finalProjectName = result?.project.name ?? uakSessionInfo.project.name ?? '';
      yield* ui.output(
        JSON.stringify({
          email: linkedSession.account.email ?? undefined,
          org_id: finalOrgId,
          project_id: finalProjectId,
          org_name: finalOrgName,
          project_name: finalProjectName,
        })
      );
      yield* ui.log.info(
        'Run `composio init` in your project directory to set up project context.'
      );
      yield* ui.log.info(
        'To switch your default global org/project later, run `composio manage orgs switch`.'
      );
      yield* ui.outro("You're all set!");
    }
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
  /** When true, print URL/session info and exit without waiting (implies noBrowser). */
  noWait?: boolean;
  /** When true (login only), skip org/project picker and use session defaults. When false, prompt for org/project. */
  skipOrgProjectPicker?: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const client = yield* ComposioSessionRepository;

    yield* Effect.logDebug(`Authenticating (scope: ${params.scope})...`);

    const session = yield* client.createSession({ scope: params.scope });

    yield* Effect.logDebug(`Created session: ${session.id}`);

    const url = `${ctx.data.webURL}?cliKey=${session.id}`;

    const effectiveNoBrowser = params.noBrowser || params.noWait;
    if (effectiveNoBrowser) {
      yield* ui.log.info('Please login using the following URL:');
    } else {
      yield* ui.log.step('Redirecting you to the login page');
    }

    yield* ui.note(url, 'Login URL');

    if (params.noWait) {
      const loginInfo = {
        status: 'pending',
        message: 'Complete login by opening the URL',
        login_url: url,
        cli_key: session.id,
        expires_at: DateTime.formatIso(session.expiresAt),
      };
      yield* ui.note(JSON.stringify(loginInfo, null, 2), 'Login info');
      yield* ui.output(JSON.stringify(loginInfo, null, 2));
      return;
    }

    yield* ui.output(url);

    if (!effectiveNoBrowser) {
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

    const willRunPicker = params.scope === 'user' && !params.skipOrgProjectPicker;
    yield* storeCredentials({
      baseURL: ctx.data.baseURL,
      uakApiKey,
      initialOrgId: xOrgId,
      initialProjectId: xProjectId,
      fallbackEmail: linkedSession.account.email,
      skipHints: willRunPicker,
      skipOutput: willRunPicker,
    });

    if (willRunPicker) {
      const result = yield* runOrgProjectSelection({
        apiKey: uakApiKey,
        baseURL: ctx.data.baseURL,
      }).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Org/project picker failed:', error);
            yield* ui.log.warn('Could not load org/project list. Using session defaults.');
            return undefined;
          })
        )
      );
      if (result) {
        const sessionUserId = uakSessionInfo.org_member.user_id ?? uakSessionInfo.org_member.id;
        const testUserId = sessionUserId ? `pg-test-${sessionUserId}` : undefined;
        yield* ctx.login(
          uakApiKey,
          result.org.id,
          result.project.id,
          testUserId ?? Option.getOrUndefined(ctx.data.testUserId)
        );
        yield* ui.log.success(
          `Default org/project set to "${result.org.name}" / "${result.project.name}".`
        );
      }
      // Emit JSON with final org/project (from picker or session) for piped/scripted consumption
      const finalOrgId = result?.org.id ?? xOrgId;
      const finalProjectId = result?.project.id ?? xProjectId;
      const finalOrgName = result?.org.name ?? uakSessionInfo.project.org.name ?? '';
      const finalProjectName = result?.project.name ?? uakSessionInfo.project.name ?? '';
      yield* ui.output(
        JSON.stringify({
          email: linkedSession.account.email ?? undefined,
          org_id: finalOrgId,
          project_id: finalProjectId,
          org_name: finalOrgName,
          project_name: finalProjectName,
        })
      );
      yield* ui.log.info(
        'Run `composio init` in your project directory to set up project context.'
      );
      yield* ui.log.info(
        'To switch your default global org/project later, run `composio manage orgs switch`.'
      );
      yield* ui.outro("You're all set!");
    }
  });

/**
 * CLI command to login using Composio's CLI session APIs.
 *
 * Browser-based: Opens browser for OAuth flow (default).
 * Use --no-browser to skip auto-opening the browser and print the URL instead.
 * Use --no-wait to print login URL and session info (JSON) then exit without opening browser or waiting.
 * Use --key to complete login with a session key from --no-wait. Without --no-wait, polls until linked;
 * with --no-wait, checks once and fails if not linked.
 * Use -y to skip org/project picker and use session defaults.
 *
 * @example
 * ```bash
 * composio login
 * composio login --no-browser
 * composio login --no-wait
 * composio login --key <key>
 * composio login --key <key> --no-wait
 * composio login -y
 * ```
 */
export const loginCmd = Command.make(
  'login',
  { noBrowser, noWait, key: keyOpt, yes: yesOpt },
  ({ noBrowser, noWait, key, yes }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;

      yield* ui.intro('composio login');

      if (Option.isSome(key)) {
        yield* loginWithKey({
          key: key.value,
          noWait,
          skipOrgProjectPicker: true,
        });
        return;
      }

      if (ctx.isLoggedIn()) {
        // Allow re-login when orgId/projectId are not yet set (old CLI login without multi-project support)
        if (Option.isSome(ctx.data.orgId) && Option.isSome(ctx.data.projectId)) {
          yield* ui.log.warn(`You're already logged in!`);
          yield* ui.outro(
            'If you want to log in with a different account, please run `composio logout` first.'
          );
          return;
        }
        yield* ui.log.step('Re-authenticating for multi-project support...');
      }

      yield* browserLogin({
        scope: 'user',
        noBrowser,
        noWait,
        skipOrgProjectPicker: yes,
      });
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
