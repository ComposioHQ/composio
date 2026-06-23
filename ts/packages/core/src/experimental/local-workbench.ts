import type { Composio } from '../composio';
import { COMPOSIO_WORKBENCH_HELPER_PATH, experimental_createWorkbenchHelperSource } from './shim';
import type { LocalWorkbenchConfig, LocalWorkbenchSession } from './types';

async function disableWorkbench(session: LocalWorkbenchSession['session']): Promise<void> {
  await session.update({ workbench: { enable: false } });
}

export async function experimental_createLocalWorkbenchSession<THandle = unknown>(
  composio: Composio,
  userId: string,
  config: LocalWorkbenchConfig<THandle>
): Promise<LocalWorkbenchSession<THandle>> {
  const { experimentalProvider: provider, ...workbench } = config.workbench;
  const composioConfig = composio.getConfig();
  const backendUrl = composioConfig.baseURL ?? 'https://backend.composio.dev';
  const apiKey = composioConfig.apiKey ?? undefined;

  const sandbox = await provider.provision({
    backendUrl,
    apiKey,
  });

  let session: LocalWorkbenchSession['session'] | undefined;
  try {
    session = await composio.create(userId, {
      ...config,
      workbench,
    });
    await provider.writeFile(
      sandbox,
      COMPOSIO_WORKBENCH_HELPER_PATH,
      experimental_createWorkbenchHelperSource({
        sessionId: session.sessionId,
        backendUrl,
        apiKey,
      })
    );
  } catch (error) {
    await Promise.allSettled([
      provider.teardown(sandbox),
      ...(session ? [disableWorkbench(session)] : []),
    ]);
    throw error;
  }

  return {
    session,
    provider,
    sandbox,
    teardown: () => provider.teardown(sandbox),
  };
}
