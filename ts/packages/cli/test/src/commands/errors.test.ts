import { describe, expect, it } from 'vitest';
import {
  ConnectionPollingError,
  MissingLinkUserIdError,
} from 'src/commands/connected-accounts/link/connected-accounts.link.errors';
import { isUsageFailure } from 'src/commands/errors';
import { InvalidOrganizationError } from 'src/commands/login/login.errors';
import { ProxyCommandError, ReportedProxyCommandError } from 'src/commands/proxy.errors';
import {
  ReportedToolExecutionError,
  ToolExecutionError,
} from 'src/commands/tools/commands/tools.execute.errors';
import { LoginSessionError } from 'src/effects/browser-login';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import {
  InvalidToolkitVersionsValidationError,
  ToolkitVersionValidationError,
} from 'src/effects/validate-toolkit-versions';
import { PendingLoginError } from 'src/services/pending-login-session';
import { ProjectEnvironmentDetectorError } from 'src/services/project-environment-detector';

describe('isUsageFailure', () => {
  it.each([
    {
      name: 'execute without a user id',
      error: new ToolExecutionError({ reason: 'missing_user_id', message: 'Missing user id.' }),
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
      name: 'proxy without a consumer user',
      error: new ProxyCommandError({ reason: 'missing_consumer_user', message: 'No user.' }),
    },
    {
      name: 'link without a user id',
      error: new MissingLinkUserIdError({ message: 'Missing user id.', flow: 'list' }),
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
  ])('[Given] $name [Then] it is a usage failure', ({ error }) => {
    expect(isUsageFailure(error)).toBe(true);
  });

  it.each([
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
      name: 'an execute failure already printed',
      error: new ReportedToolExecutionError({ reason: 'execution_failed', message: 'Failed.' }),
    },
    {
      name: 'a proxy failure already printed',
      error: new ReportedProxyCommandError({ reason: 'toolkit_not_connected', message: 'No.' }),
    },
    { name: 'a plain Error', error: new Error('boom') },
  ])('[Given] $name [Then] it is not a usage failure', ({ error }) => {
    expect(isUsageFailure(error)).toBe(false);
  });
});
