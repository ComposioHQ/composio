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
import { commandHintStep } from 'src/services/command-hints';
import { runOrgSelection } from 'src/effects/select-org-project';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { installSkillSafe } from 'src/effects/install-skill';

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
  Options.withDescription('Skip org picker; use session default org')
);

const noSkillInstall = Options.boolean('no-skill-install').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip installing the composio-cli skill for Claude Code')
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
  /** When true, skip the init/switch hints and outro (shown later after org picker). */
  skipHints?: boolean;
  /** When true, skip JSON output (emitted later after org picker with final selection). */
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
    const sessionUserId = sessionInfo?.org_member.user_id ?? sessionInfo?.org_member.id;
    const testUserId = sessionUserId
      ? `pg-test-${sessionUserId}`
      : Option.getOrUndefined(ctx.data.testUserId);

    if (sessionInfo) {
      if (initialOrgId !== orgId) {
        yield* Effect.logDebug(`orgId corrected: ${initialOrgId} -> ${orgId} (from session/info)`);
      }
    }

    yield* ctx.login(uakApiKey, orgId, testUserId);
    yield* primeConsumerConnectedToolkitsCacheInBackground({
      orgId,
    });

    const email = sessionInfo?.org_member.email || fallbackEmail || undefined;
    yield* ui.log.success(email ? `Logged in as ${email}` : 'Logged in successfully');
    if (!skipHints) {
      yield* ui.log.info(commandHintStep('Set up developer project context', 'dev.init'));
      yield* ui.log.info(commandHintStep('Switch your default org later', 'dev.orgs.switch'));
    }

    // Emit structured JSON for piped/scripted consumption (agent-native)
    if (!skipOutput) {
      yield* ui.output(
        JSON.stringify({
          email,
          org_id: orgId,
          org_name: sessionInfo?.project.org.name ?? '',
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
      const result = yield* runOrgSelection({
        apiKey: uakApiKey,
        baseURL: ctx.data.baseURL,
      }).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Org picker failed:', error);
            yield* ui.log.warn('Could not load org list. Using session default org.');
            return undefined;
          })
        )
      );
      if (result) {
        const sessionUserId = uakSessionInfo.org_member.user_id ?? uakSessionInfo.org_member.id;
        const testUserId = sessionUserId ? `pg-test-${sessionUserId}` : undefined;
        yield* ctx.login(
          uakApiKey,
          result.id,
          testUserId ?? Option.getOrUndefined(ctx.data.testUserId)
        );
        yield* primeConsumerConnectedToolkitsCacheInBackground({
          orgId: result.id,
        });
        yield* ui.log.success(`Default org set to "${result.name}".`);
      }
      const finalOrgId = result?.id ?? xOrgId;
      const finalOrgName = result?.name ?? uakSessionInfo.project.org.name ?? '';
      yield* ui.output(
        JSON.stringify({
          email: linkedSession.account.email ?? undefined,
          org_id: finalOrgId,
          org_name: finalOrgName,
        })
      );
      yield* ui.log.info(commandHintStep('Set up developer project context', 'dev.init'));
      yield* ui.log.info(commandHintStep('Switch your default org later', 'dev.orgs.switch'));
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
      const result = yield* runOrgSelection({
        apiKey: uakApiKey,
        baseURL: ctx.data.baseURL,
      }).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Org picker failed:', error);
            yield* ui.log.warn('Could not load org list. Using session default org.');
            return undefined;
          })
        )
      );
      if (result) {
        const sessionUserId = uakSessionInfo.org_member.user_id ?? uakSessionInfo.org_member.id;
        const testUserId = sessionUserId ? `pg-test-${sessionUserId}` : undefined;
        yield* ctx.login(
          uakApiKey,
          result.id,
          testUserId ?? Option.getOrUndefined(ctx.data.testUserId)
        );
        yield* primeConsumerConnectedToolkitsCacheInBackground({
          orgId: result.id,
        });
        yield* ui.log.success(`Default org set to "${result.name}".`);
      }
      const finalOrgId = result?.id ?? xOrgId;
      const finalOrgName = result?.name ?? uakSessionInfo.project.org.name ?? '';
      yield* ui.output(
        JSON.stringify({
          email: linkedSession.account.email ?? undefined,
          org_id: finalOrgId,
          org_name: finalOrgName,
        })
      );
      yield* ui.log.info(commandHintStep('Set up developer project context', 'dev.init'));
      yield* ui.log.info(commandHintStep('Switch your default org later', 'dev.orgs.switch'));
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
 * Use -y to skip org picker and use session default org.
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
  { noBrowser, noWait, key: keyOpt, yes: yesOpt, noSkillInstall },
  ({ noBrowser, noWait, key, yes, noSkillInstall }) =>
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
        if (!noSkillInstall) {
          yield* installSkillSafe();
        }
        return;
      }

      if (ctx.isLoggedIn()) {
        if (Option.isSome(ctx.data.orgId)) {
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

      if (!noSkillInstall && !noWait) {
        yield* installSkillSafe();
      }
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
