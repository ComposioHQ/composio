import { Command, Flag } from 'effect/cli';
import { runLogin } from './login.handler';

const noBrowser = Flag.Boolean('no-browser').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Login without browser interaction')
);

const pollOpt = Flag.Boolean('poll').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Poll the most recent pending browser login and complete it')
);

const noWait = Flag.Boolean('no-wait').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Print login URL and session info, then exit without opening browser or waiting'
  )
);

const keyOpt = Flag.String('key').pipe(
  Flag.withDescription('Poll and complete login using the session key from composio login'),
  Flag.optional
);

const userApiKeyOpt = Flag.String('user-api-key').pipe(
  Flag.withDescription('Log in directly with a Composio user API key'),
  Flag.optional
);

const orgOpt = Flag.String('org').pipe(
  Flag.withDescription('Current organization ID or name to store for CLI commands'),
  Flag.optional
);

const yesOpt = Flag.Boolean('yes').pipe(
  Flag.withAlias('y'),
  Flag.withDefault(false),
  Flag.withDescription('Skip org picker; use current org')
);

const noSkillInstall = Flag.Boolean('no-skill-install').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Skip installing the composio-cli skill for Claude Code')
);

const agentOpt = Flag.Boolean('agent').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Sign up or log in using a Composio agent identity')
);

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
 * Non-interactive default flow: prints URL + poll instructions, or logs in
 * unattended when a READY agent identity is already stored.
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
  runLogin
).pipe(Command.withDescription('Log in to the Composio SDK.'));
