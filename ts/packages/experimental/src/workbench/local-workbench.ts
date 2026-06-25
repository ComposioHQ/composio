import type { Composio, Session } from '@composio/core';
import {
  experimental_createPythonWorkbenchHelperSource,
  experimental_createWorkbenchEnv,
} from './shim';
import type { LocalWorkbenchSession } from './types';

export async function experimental_createLocalWorkbenchSession(
  composio: Composio,
  session: Session<unknown, unknown, never>
): Promise<LocalWorkbenchSession> {
  if (session.workbench?.enable !== false) {
    throw new Error(
      'experimental_createLocalWorkbenchSession requires a session created with workbench.enable: false. ' +
        'The remote workbench and a local sandbox cannot both run for one session.'
    );
  }

  const { apiKey, baseURL } = composio.getConfig();
  if (!apiKey) {
    throw new Error('A Composio project API key is required to create a local workbench session');
  }

  const env = experimental_createWorkbenchEnv({
    sessionId: session.sessionId,
    backendUrl: baseURL ?? 'https://backend.composio.dev',
    apiKey,
  });

  return {
    env,
    helperSource: experimental_createPythonWorkbenchHelperSource(),
  };
}
