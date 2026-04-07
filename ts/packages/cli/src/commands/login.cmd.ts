import { Command, Options } from '@effect/cli';
import { DateTime, Effect, Option, Schedule } from 'effect';
import open from 'open';
import {
  ComposioSessionRepository,
  getSessionInfo,
  getSessionInfoByUserApiKey,
  listOrganizations,
  type SessionInfoResponse,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { commandHintStep } from 'src/services/command-hints';
import { runOrgSelection } from 'src/effects/select-org-project';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { inferSkillReleaseChannel, installSkillSafe } from 'src/effects/install-skill';
import { APP_VERSION } from 'src/constants';

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

const userApiKeyOpt = Options.text('user-api-key').pipe(
  Options.withDescription('Log in directly with a Composio user API key'),
  Options.optional
);

const orgOpt = Options.text('org').pipe(
  Options.withDescription('Default organization ID or name to store for CLI commands'),
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

const formatLoginSuccessMessage = (params: { email?: string; orgName?: string }): string => {
  const { email, orgName } = params;
  if (email && orgName) {
    return `Logged in as ${email} in "${orgName}"`;
  }
  if (email) {
    return `Logged in as ${email}`;
  }
  if (orgName) {
    return `Logged in successfully in "${orgName}"`;
  }
  return 'Logged in successfully';
};

const emitLoginComplete = (params: {
  email?: string;
  orgId: string;
  orgName?: string;
  skipHints?: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { email, orgId, orgName, skipHints = false } = params;

    yield* ui.log.success(formatLoginSuccessMessage({ email, orgName }));
    if (!skipHints) {
      yield* ui.log.info(commandHintStep('Execute a tool directly', 'root.execute'));
      yield* ui.log.info(commandHintStep('Switch your default org', 'root.orgs.switch'));
    }

    yield* ui.output(
      JSON.stringify({
        email,
        org_id: orgId,
        org_name: orgName ?? '',
      })
    );

    if (!skipHints) {
      yield* ui.outro("You're all set!");
    }
  });

const resolveDirectLoginOrganization = (params: {
  apiKey: string;
  baseURL: string;
  requestedOrg?: string;
  fallbackOrgId: string;
  fallbackOrgName?: string;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { apiKey, baseURL, requestedOrg, fallbackOrgId, fallbackOrgName } = params;

    if (!requestedOrg) {
      return {
        id: fallbackOrgId,
        name: fallbackOrgName ?? fallbackOrgId,
      };
    }

    const organizations = yield* listOrganizations({
      baseURL,
      apiKey,
    });
    const match = organizations.data.find(
      org => org.id === requestedOrg || org.name === requestedOrg
    );

    if (!match) {
      yield* ui.log.error(`Organization "${requestedOrg}" was not found for this API key.`);
      return yield* Effect.fail(
        new Error('Invalid organization. Run `composio orgs list` to inspect available orgs.')
      );
    }

    return match;
  });

const directLogin = (params: { userApiKey: string; org?: string }) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const sessionInfo = yield* getSessionInfoByUserApiKey({
      baseURL: ctx.data.baseURL,
      userApiKey: params.userApiKey,
    });

    const selectedOrg = yield* resolveDirectLoginOrganization({
      apiKey: params.userApiKey,
      baseURL: ctx.data.baseURL,
      requestedOrg: params.org,
      fallbackOrgId: sessionInfo.project.org.id,
      fallbackOrgName: sessionInfo.project.org.name,
    });

    const sessionUserId = sessionInfo.org_member.user_id ?? sessionInfo.org_member.id;
    const testUserId = sessionUserId
      ? `pg-test-${sessionUserId}`
      : Option.getOrUndefined(ctx.data.testUserId);

    yield* ctx.login(params.userApiKey, selectedOrg.id, testUserId);
    yield* primeConsumerConnectedToolkitsCacheInBackground({
      orgId: selectedOrg.id,
    });
    yield* emitLoginComplete({
      email: sessionInfo.org_member.email || undefined,
      orgId: selectedOrg.id,
      orgName: selectedOrg.name,
    });
  });

/**
 * Verifies credentials via session/info and stores them.
 *
 * Resolves ComposioUserContext from the Effect context rather
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

    if (!skipOutput) {
      yield* emitLoginComplete({
        email: sessionInfo?.org_member.email || fallbackEmail || undefined,
        orgId,
        orgName: sessionInfo?.project.org.name || undefined,
        skipHints,
      });
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
      }
      const finalOrgId = result?.id ?? xOrgId;
      const finalOrgName = result?.name ?? uakSessionInfo.project.org.name ?? '';
      yield* emitLoginComplete({
        email: linkedSession.account.email ?? undefined,
        orgId: finalOrgId,
        orgName: finalOrgName,
      });
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
      }
      const finalOrgId = result?.id ?? xOrgId;
      const finalOrgName = result?.name ?? uakSessionInfo.project.org.name ?? '';
      yield* emitLoginComplete({
        email: linkedSession.account.email ?? undefined,
        orgId: finalOrgId,
        orgName: finalOrgName,
      });
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
 * Use --user-api-key to log in directly without a browser flow, and --org to override the default org.
 * Use -y to skip org picker and use session default org.
 *
 * @example
 * ```bash
 * composio login
 * composio login --no-browser
 * composio login --no-wait
 * composio login --key <key>
 * composio login --key <key> --no-wait
 * composio login --user-api-key <uak>
 * composio login --user-api-key <uak> --org <org>
 * composio login -y
 * ```
 */
export const loginCmd = Command.make(
  'login',
  {
    noBrowser,
    noWait,
    key: keyOpt,
    userApiKey: userApiKeyOpt,
    org: orgOpt,
    yes: yesOpt,
    noSkillInstall,
  },
  ({ noBrowser, noWait, key, userApiKey, org, yes, noSkillInstall }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;

      yield* ui.intro('composio login');

      if (Option.isSome(key) && Option.isSome(userApiKey)) {
        return yield* Effect.fail(new Error('Use either `--key` or `--user-api-key`, not both.'));
      }

      if (Option.isSome(org) && Option.isNone(userApiKey)) {
        return yield* Effect.fail(new Error('`--org` requires `--user-api-key`.'));
      }

      if (Option.isSome(userApiKey) && (noBrowser || noWait || Option.isSome(key))) {
        return yield* Effect.fail(
          new Error(
            '`--user-api-key` is a direct login path and cannot be combined with browser or session flags.'
          )
        );
      }

      if (Option.isSome(key)) {
        yield* loginWithKey({
          key: key.value,
          noWait,
          skipOrgProjectPicker: true,
        });
        if (!noSkillInstall) {
          yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
        }
        return;
      }

      if (Option.isSome(userApiKey)) {
        yield* directLogin({
          userApiKey: userApiKey.value,
          org: Option.getOrUndefined(org),
        });
        if (!noSkillInstall) {
          yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
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
        yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
      }
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
