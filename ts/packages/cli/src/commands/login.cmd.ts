import path from 'node:path';
import { Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { DateTime, Effect, Option, Schedule } from 'effect';
import open from 'open';
import {
  ComposioSessionRepository,
  getSessionInfo,
  getSessionInfoByUserApiKey,
  listOrganizations,
  type OrganizationSummary,
  type SessionInfoResponse,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { commandHintStep } from 'src/services/command-hints';
import { runOrgSelection } from 'src/effects/select-org-project';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { inferSkillReleaseChannel, installSkillSafe } from 'src/effects/install-skill';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { APP_VERSION } from 'src/constants';
import { isInteractiveTerminal } from 'src/utils/stdio';
import {
  ensureAgentSignupAllowed,
  getOrSignupReadyAgent,
  loginWithAgentIdentity,
  safeAgentSummary,
} from 'src/services/agents';

export const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Login without browser interaction')
);

const pollOpt = Options.boolean('poll').pipe(
  Options.withDefault(false),
  Options.withDescription('Poll the most recent pending browser login and complete it')
);

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Print login URL and session info, then exit without opening browser or waiting'
  )
);

const keyOpt = Options.text('key').pipe(
  Options.withDescription('Poll and complete login using the session key from composio login'),
  Options.optional
);

const userApiKeyOpt = Options.text('user-api-key').pipe(
  Options.withDescription('Log in directly with a Composio user API key'),
  Options.optional
);

const orgOpt = Options.text('org').pipe(
  Options.withDescription('Current organization ID or name to store for CLI commands'),
  Options.optional
);

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Skip org picker; use current org')
);

const noSkillInstall = Options.boolean('no-skill-install').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip installing the composio-cli skill for Claude Code')
);

const agentOpt = Options.boolean('agent').pipe(
  Options.withDefault(false),
  Options.withDescription('Sign up or log in using a Composio agent identity')
);

const PENDING_LOGIN_FILE_NAME = 'pending-login-session.json';
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;
const LOGIN_POLL_INTERVAL_SECONDS = 5;
const LOGIN_POLL_TIMEOUT_SECONDS = 10 * 60;
const LOGIN_POLL_RETRIES = Math.ceil(LOGIN_POLL_TIMEOUT_SECONDS / LOGIN_POLL_INTERVAL_SECONDS);

type PendingLoginSession = {
  readonly key: string;
  readonly loginUrl: string;
  readonly expiresAt: string;
  readonly cachedAt: string;
};

const pendingLoginPath = Effect.gen(function* () {
  const cacheDir = yield* setupCacheDir;
  return path.join(cacheDir, PENDING_LOGIN_FILE_NAME);
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parsePendingLoginSession = (raw: string): PendingLoginSession => {
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    typeof parsed.key !== 'string' ||
    typeof parsed.loginUrl !== 'string' ||
    typeof parsed.expiresAt !== 'string' ||
    typeof parsed.cachedAt !== 'string'
  ) {
    throw new Error('Pending login cache is invalid');
  }
  return {
    key: parsed.key,
    loginUrl: parsed.loginUrl,
    expiresAt: parsed.expiresAt,
    cachedAt: parsed.cachedAt,
  };
};

const writePendingLoginSession = (session: Omit<PendingLoginSession, 'cachedAt'>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const filePath = yield* pendingLoginPath;
    const payload: PendingLoginSession = {
      ...session,
      cachedAt: new Date().toISOString(),
    };
    yield* fs.writeFileString(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  });

const clearPendingLoginSession = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* pendingLoginPath;
  yield* fs.remove(filePath).pipe(Effect.catchAll(() => Effect.void));
});

const readPendingLoginSession = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* pendingLoginPath;
  const exists = yield* fs.exists(filePath);
  if (!exists) {
    return yield* Effect.fail(
      new Error('No pending login found. Run `composio login < /dev/null` first.')
    );
  }

  const session = yield* fs
    .readFileString(filePath, 'utf8')
    .pipe(Effect.map(parsePendingLoginSession));
  const cachedAt = Date.parse(session.cachedAt);
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > PENDING_LOGIN_TTL_MS) {
    yield* clearPendingLoginSession;
    return yield* Effect.fail(
      new Error('Pending login expired. Run `composio login < /dev/null` again.')
    );
  }

  return session;
});

const formatNonInteractiveLoginInstructions = (params: {
  readonly loginUrl: string;
  readonly pollCommand: string;
}) => `Open this URL in your browser to log in:

  ${params.loginUrl}

Then run this command to complete login:

  ${params.pollCommand}

hint: For agents: Show the URL above to the user to click, then run the command above. The command uses the cached login key, polls for up to 10 minutes, and exits once credentials are saved. Do not ask the user whether to poll — they already requested login.`;

const formatPollLoginComplete = (params: {
  readonly email?: string;
  readonly defaultOrgId: string;
  readonly defaultOrgName?: string;
  readonly organizations: ReadonlyArray<OrganizationSummary>;
}) => {
  const orgLines =
    params.organizations.length > 0
      ? params.organizations
          .map(org => `  ${org.id === params.defaultOrgId ? '*' : '-'} ${org.name} (${org.id})`)
          .join('\n')
      : '  No organizations were returned for this account.';

  return `Login complete${params.email ? ` for ${params.email}` : ''}.

Current org:

  ${params.defaultOrgName ?? params.defaultOrgId} (${params.defaultOrgId})

Available organizations:

${orgLines}

The CLI selected the first organization as your current org. To choose a different current org, run:

  composio orgs switch --org-id <org_id>`;
};

const serializePollLoginResult = (params: {
  readonly email?: string;
  readonly defaultOrgId: string;
  readonly defaultOrgName?: string;
  readonly organizations: ReadonlyArray<OrganizationSummary>;
}) =>
  JSON.stringify(
    {
      email: params.email ?? null,
      current_org: {
        id: params.defaultOrgId,
        name: params.defaultOrgName ?? params.defaultOrgId,
      },
      organizations: params.organizations.map(org => ({
        id: org.id,
        name: org.name,
        selected: org.id === params.defaultOrgId,
      })),
      switch_command: 'composio orgs switch --org-id <org_id>',
    },
    null,
    2
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
      yield* ui.log.info(commandHintStep('Switch your current org', 'root.orgs.switch'));
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
const loginWithKey = (params: {
  key: string;
  noWait: boolean;
  skipOrgProjectPicker: boolean;
  pollRetries?: number;
  defaultToFirstOrg?: boolean;
  skipOutput?: boolean;
}) =>
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
            Schedule.intersect(Schedule.recurs(params.pollRetries ?? 15)),
            Schedule.intersect(Schedule.spaced(`${LOGIN_POLL_INTERVAL_SECONDS} seconds`))
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

    const organizations = params.defaultToFirstOrg
      ? yield* listOrganizations({
          baseURL: ctx.data.baseURL,
          apiKey: uakApiKey,
        }).pipe(
          Effect.map(response => response.data),
          Effect.catchAll(error =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to list organizations after login:', error);
              return [] as ReadonlyArray<OrganizationSummary>;
            })
          )
        )
      : [];
    const defaultOrg = params.defaultToFirstOrg ? organizations[0] : undefined;
    const xProjectId = uakSessionInfo.project.nano_id;
    const xOrgId = defaultOrg?.id ?? uakSessionInfo.project.org.id;
    const xOrgName = defaultOrg?.name ?? uakSessionInfo.project.org.name;

    const willRunPicker = !params.skipOrgProjectPicker;
    yield* storeCredentials({
      baseURL: ctx.data.baseURL,
      uakApiKey,
      initialOrgId: xOrgId,
      initialProjectId: xProjectId,
      fallbackEmail: linkedSession.account.email,
      skipHints: willRunPicker,
      skipOutput: true,
    });

    if (willRunPicker) {
      const result = yield* runOrgSelection({
        apiKey: uakApiKey,
        baseURL: ctx.data.baseURL,
      }).pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Org picker failed:', error);
            yield* ui.log.warn('Could not load org list. Using current org.');
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
      return {
        email: linkedSession.account.email ?? undefined,
        orgId: finalOrgId,
        orgName: finalOrgName,
        organizations,
      };
    }

    if (!params.skipOutput) {
      yield* emitLoginComplete({
        email: linkedSession.account.email ?? undefined,
        orgId: xOrgId,
        orgName: xOrgName,
      });
    }

    return {
      email: linkedSession.account.email ?? undefined,
      orgId: xOrgId,
      orgName: xOrgName,
      organizations,
    };
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
    const pollCommand = 'composio login --poll';
    const expiresAt = DateTime.formatIso(session.expiresAt);
    yield* writePendingLoginSession({
      key: session.id,
      loginUrl: url,
      expiresAt,
    });

    const canPrompt = isInteractiveTerminal();
    const effectiveNoWait = params.noWait || !canPrompt;
    const effectiveNoBrowser = params.noBrowser || effectiveNoWait;

    if (effectiveNoWait) {
      const loginInstructions = formatNonInteractiveLoginInstructions({
        loginUrl: url,
        pollCommand,
      });

      if (canPrompt) {
        yield* ui.log.info('Please login using the following URL:');
        yield* ui.note(url, 'Login URL');
        yield* ui.note(loginInstructions, 'Login instructions');
      }

      yield* ui.output(loginInstructions);
      return;
    }

    if (effectiveNoBrowser) {
      yield* ui.log.info('Please login using the following URL:');
    } else {
      yield* ui.log.step('Redirecting you to the login page');
    }

    yield* ui.note(url, 'Login URL');

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
            yield* ui.log.warn('Could not load org list. Using current org.');
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
 * Use --user-api-key to log in directly without a browser flow, and --org to override the current org.
 * Use --agent to sign up or log in using a Composio agent identity.
 * Use -y to skip org picker and use current org.
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
 * composio login --agent
 * composio login -y
 * ```
 */
export const loginCmd = Command.make(
  'login',
  {
    noBrowser,
    poll: pollOpt,
    noWait,
    key: keyOpt,
    userApiKey: userApiKeyOpt,
    org: orgOpt,
    yes: yesOpt,
    noSkillInstall,
    agent: agentOpt,
  },
  ({ noBrowser, poll, noWait, key, userApiKey, org, yes, noSkillInstall, agent }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const canPrompt = isInteractiveTerminal();

      if (canPrompt) {
        yield* ui.intro('composio login');
      }

      if (Option.isSome(key) && Option.isSome(userApiKey)) {
        return yield* Effect.fail(new Error('Use either `--key` or `--user-api-key`, not both.'));
      }

      if (
        poll &&
        (noBrowser || noWait || Option.isSome(key) || Option.isSome(userApiKey) || agent)
      ) {
        return yield* Effect.fail(
          new Error(
            '`--poll` cannot be combined with browser, session, direct-login, or agent flags.'
          )
        );
      }

      if (agent && (noBrowser || noWait || Option.isSome(key) || Option.isSome(userApiKey))) {
        return yield* Effect.fail(
          new Error('`--agent` cannot be combined with browser, session, or direct-login flags.')
        );
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

      if (poll) {
        const pendingLogin = yield* readPendingLoginSession;
        const loginResult = yield* loginWithKey({
          key: pendingLogin.key,
          noWait: false,
          skipOrgProjectPicker: true,
          pollRetries: LOGIN_POLL_RETRIES,
          defaultToFirstOrg: true,
          skipOutput: true,
        });
        yield* clearPendingLoginSession;
        const pollSummaryParams = {
          email: loginResult.email,
          defaultOrgId: loginResult.orgId,
          defaultOrgName: loginResult.orgName,
          organizations: loginResult.organizations,
        };
        const pollSummary = formatPollLoginComplete(pollSummaryParams);
        if (canPrompt) {
          yield* ui.note(pollSummary, 'Login complete');
        }
        yield* ui.output(serializePollLoginResult(pollSummaryParams), { force: true });
        if (!noSkillInstall && canPrompt) {
          yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
        }
        return;
      }

      if (agent) {
        return yield* handleAgentAuthError(
          Effect.gen(function* () {
            yield* ensureAgentSignupAllowed;
            const identity = yield* getOrSignupReadyAgent();
            yield* loginWithAgentIdentity(identity);
            const summary = safeAgentSummary(identity);
            yield* ui.log.success(
              `Logged in as Composio agent ${summary.email ?? summary.slug ?? ''}`
            );
            yield* ui.output(JSON.stringify({ ...summary, logged_in: true }));
            if (!noSkillInstall && canPrompt) {
              yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
            }
          })
        );
      }

      if (Option.isSome(key)) {
        yield* loginWithKey({
          key: key.value,
          noWait,
          skipOrgProjectPicker: true,
        });
        if (!noSkillInstall && canPrompt) {
          yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
        }
        return;
      }

      if (Option.isSome(userApiKey)) {
        yield* directLogin({
          userApiKey: userApiKey.value,
          org: Option.getOrUndefined(org),
        });
        if (!noSkillInstall && canPrompt) {
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

      if (!noSkillInstall && !noWait && canPrompt) {
        yield* installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) });
      }
    })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
