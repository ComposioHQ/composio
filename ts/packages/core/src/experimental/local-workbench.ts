import type { Composio } from '../composio';
import {
  experimental_createPythonWorkbenchHelperSource,
  experimental_createWorkbenchEnv,
} from './shim';
import type { LocalWorkbenchConfig, LocalWorkbenchSession } from './types';

export async function experimental_createLocalWorkbenchSession(
  composio: Composio,
  userId: string,
  config: LocalWorkbenchConfig = {}
): Promise<LocalWorkbenchSession> {
  const composioConfig = composio.getConfig();
  const backendUrl = (composioConfig.baseURL ?? 'https://backend.composio.dev').replace(/\/+$/, '');
  const apiKey = composioConfig.apiKey;

  if (!apiKey) {
    throw new Error('A Composio project API key is required to create a local workbench session');
  }

  const session = await composio.create(userId, {
    ...config,
    workbench: {
      ...config.workbench,
      enable: false,
    },
  });

  const env = experimental_createWorkbenchEnv({
    sessionId: session.sessionId,
    backendUrl,
    apiKey,
  });

  return {
    session,
    env,
    helperSource: experimental_createPythonWorkbenchHelperSource(),
  };
}
