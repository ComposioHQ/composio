import type { Composio } from '@composio/core';
import type { LocalWorkbenchConfig, LocalWorkbenchSession } from './types';

export async function experimental_createLocalWorkbenchSession(
  composio: Composio,
  userId: string,
  config: LocalWorkbenchConfig
): Promise<LocalWorkbenchSession> {
  const { experimentalProvider: provider, ...workbench } = config.workbench;
  const session = await composio.create(userId, {
    ...config,
    workbench,
  });
  const composioConfig = composio.getConfig();
  const sandbox = await provider.provision({
    sessionId: session.sessionId,
    backendUrl: composioConfig.baseURL ?? 'https://backend.composio.dev',
    apiKey: composioConfig.apiKey ?? undefined,
  });

  return {
    session,
    provider,
    sandbox,
    teardown: () => provider.teardown(sandbox),
  };
}
