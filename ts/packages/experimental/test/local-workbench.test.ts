import { describe, expect, it, vi } from 'vitest';
import { experimental_createLocalWorkbenchSession } from '../src';
import type { SandboxProvider } from '../src';

describe('experimental_createLocalWorkbenchSession', () => {
  it('strips the SDK-only experimentalProvider before creating the Tool Router session', async () => {
    const sandbox = { id: 'sandbox_123' };
    const provider: SandboxProvider<typeof sandbox> = {
      provider: 'e2b',
      provision: vi.fn().mockResolvedValue(sandbox),
      exec: vi.fn(),
      runBash: vi.fn(),
      writeFile: vi.fn(),
      teardown: vi.fn(),
    };
    const composio = {
      create: vi.fn().mockResolvedValue({ sessionId: 'session_123' }),
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'project_key',
        baseURL: 'https://backend.test',
      }),
    };

    const workbench = await experimental_createLocalWorkbenchSession(
      composio as never,
      'user_123',
      {
        toolkits: ['github'],
        workbench: {
          enable: true,
          sandboxSize: 'large',
          experimentalProvider: provider,
        },
      }
    );

    expect(composio.create).toHaveBeenCalledWith('user_123', {
      toolkits: ['github'],
      workbench: {
        enable: true,
        sandboxSize: 'large',
      },
    });
    expect(provider.provision).toHaveBeenCalledWith({
      sessionId: 'session_123',
      backendUrl: 'https://backend.test',
      apiKey: 'project_key',
    });
    expect(workbench.sandbox).toBe(sandbox);
  });
});
