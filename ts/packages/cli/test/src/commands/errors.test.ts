import { Option, Predicate } from 'effect';
import { describe, expect, it } from 'vitest';
import { ConnectionPollingError } from 'src/commands/connected-accounts/link/connected-accounts.link.errors';
import { commandInputError, isUsageFailure, notLoggedIn } from 'src/commands/errors';
import { InvalidOrganizationError } from 'src/commands/login/login.errors';
import { ReportedProxyCommandError } from 'src/commands/proxy.cmd';
import { MissingActingUserError } from 'src/commands/surface';
import {
  ReportedToolExecutionError,
  ToolExecutionError,
} from 'src/commands/tools/commands/tools.execute.cmd';
import { LoginSessionError } from 'src/effects/browser-login';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import {
  InvalidToolkitVersionsValidationError,
  ToolkitVersionValidationError,
} from 'src/effects/validate-toolkit-versions';
import { ProjectResolutionError } from 'src/services/command-project';
import { ConnectedAccountResolutionError } from 'src/services/connected-account-selection';
import { PendingLoginError } from 'src/services/pending-login-session';
import { ProjectEnvironmentDetectorError } from 'src/services/project-environment-detector';

const expected = [
  { name: 'a usage mistake', error: commandInputError('execute')('Bad flag.', '--flag') },
  { name: 'a missing login', error: notLoggedIn() },
  {
    name: 'an unresolved project',
    error: new ProjectResolutionError({ reason: 'missing_org', message: 'No current org.' }),
  },
  {
    name: 'an --account that matches no connected account',
    error: new ConnectedAccountResolutionError({ message: 'No match.', toolkitSlug: 'gmail' }),
  },
  {
    // Every command without a user to act as: execute, search, link, connections, listen, proxy.
    name: 'a command without a user to act as',
    error: new MissingActingUserError({
      tree: 'root',
      projectName: Option.none(),
      message: 'Missing consumer user id.',
    }),
  },
  {
    name: 'execute with a --file the tool cannot take',
    error: new ToolExecutionError({ reason: 'file_input', message: 'No file input.' }),
  },
  {
    name: 'execute with a toolkit that is not connected',
    error: new ToolExecutionError({ reason: 'connection_check', message: 'Not connected.' }),
  },
  {
    name: 'link with an authorization not finished in time',
    error: new ConnectionPollingError({
      message: "Connection status is still 'INITIATED', waiting for 'ACTIVE'",
      connectedAccountId: 'ca_1',
      status: 'INITIATED',
    }),
  },
  {
    name: 'login with an unknown --org',
    error: new InvalidOrganizationError({ message: 'Invalid organization.', requestedOrg: 'x' }),
  },
  {
    name: 'login with an expired session',
    error: new LoginSessionError({ message: 'Session not found.', operation: 'load' }),
  },
  {
    name: 'login --poll without a pending login',
    error: new PendingLoginError({ message: 'No pending login found.', reason: 'missing' }),
  },
  {
    name: 'login --poll with an expired pending login',
    error: new PendingLoginError({ message: 'Pending login expired.', reason: 'expired' }),
  },
  {
    name: 'generate without @composio/core installed',
    error: new ComposioCorePkgNotFound({
      message: '@composio/core not found',
      cause: '@composio/core not installed',
    }),
  },
  {
    name: 'generate outside a recognizable project',
    error: new ProjectEnvironmentDetectorError({
      cause: new Error('No project language detected'),
      message: 'No recognizable project indicators found.',
      checkedPaths: [],
    }),
  },
  {
    name: 'a toolkit version override naming an unknown version',
    error: new InvalidToolkitVersionsValidationError([
      { toolkit: 'gmail', requestedVersion: 'nope', availableVersions: ['20260101_00'] },
    ]),
  },
  {
    name: 'a toolkit version override naming an unknown toolkit',
    error: new ToolkitVersionValidationError({
      message: 'Invalid toolkit(s) in version overrides: gmal.',
      reason: 'invalid-toolkit',
    }),
  },
];

const defects = [
  {
    name: 'a toolkit version check whose request failed',
    error: new ToolkitVersionValidationError({ message: 'Failed.', reason: 'request' }),
  },
  {
    name: 'a toolkit version check whose response did not decode',
    error: new ToolkitVersionValidationError({ message: 'Failed.', reason: 'decode' }),
  },
  {
    name: 'a toolkit version check without a client',
    error: new ToolkitVersionValidationError({
      message: 'API client not initialized',
      reason: 'client-unavailable',
    }),
  },
  {
    name: 'a pending login cache that cannot be read',
    error: new PendingLoginError({
      message: 'Failed to read pending login cache',
      reason: 'io',
      cause: new Error('EACCES'),
    }),
  },
  {
    name: 'a pending login cache that does not decode',
    error: new PendingLoginError({ message: 'Pending login cache is invalid', reason: 'invalid' }),
  },
  {
    name: 'an execute failure already printed',
    error: new ReportedToolExecutionError({ reason: 'execution_failed', message: 'Failed.' }),
  },
  {
    name: 'a proxy failure already printed',
    error: new ReportedProxyCommandError({
      message: 'Not connected.',
      toolkit: 'gmail',
      endpoint: 'https://gmail.googleapis.com',
    }),
  },
  { name: 'a plain Error', error: new Error('boom') },
];

describe('isUsageFailure', () => {
  it.each(expected)('[Given] $name [Then] it is a usage failure', ({ error }) => {
    expect(isUsageFailure(error)).toBe(true);
  });

  it.each(defects)('[Given] $name [Then] it is not a usage failure', ({ error }) => {
    expect(isUsageFailure(error)).toBe(false);
  });

  // The marker is a prototype getter: declaring it must not add an own property, which would
  // change the error's structural equality and what a reporter prints for it.
  it.each(expected)(
    '[Given] $name [Then] its class declares the marker off the instance',
    ({ error }) => {
      expect(Predicate.hasProperty(error, ExpectedFailure)).toBe(true);
      expect(Object.getOwnPropertySymbols(error)).not.toContain(ExpectedFailure);
    }
  );

  it('[Given] an object that only claims the marker [Then] it still needs a string message', () => {
    expect(isUsageFailure({ [ExpectedFailure]: true })).toBe(false);
    expect(isUsageFailure({ [ExpectedFailure]: true, message: 'Fix it.' })).toBe(true);
  });
});
