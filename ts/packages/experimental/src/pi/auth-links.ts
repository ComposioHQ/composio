import { extractComposioConnectLinks } from '../auth-links';
import { runHook } from './hooks';
import { hookControls } from './results';
import type { PiAuthLinkContext, PiHookControls, PiSessionToolCapabilities } from './types';

export { extractComposioConnectLinks } from '../auth-links';

export const applyAuthLinkHandlers = async (
  capabilities: PiSessionToolCapabilities,
  value: unknown,
  context: Omit<PiAuthLinkContext, 'url' | keyof PiHookControls>
): Promise<{ value: unknown; authLinks: string[] }> => {
  const links = extractComposioConnectLinks(value);
  const run = async (index: number, currentValue: unknown): Promise<unknown> => {
    const url = links[index];
    if (!url) return currentValue;
    return run(
      index + 1,
      await runHook(
        capabilities.hooks?.onAuthLink,
        { ...context, ...hookControls, url, result: currentValue },
        async () => currentValue
      )
    );
  };

  return { value: await run(0, value), authLinks: links };
};
