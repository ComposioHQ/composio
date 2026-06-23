import { describe, expect, it, vi } from 'vitest';
import { experimental_createLocalWorkbenchSession } from '../src';
import type { SandboxProvider } from '../src';

describe('experimental_createLocalWorkbenchSession', () => {
  it('strips the SDK-only experimentalProvider before creating the Tool Router session', async () => {
    const sandbox = { id: 'sandbox_123' };
    const session = {
      sessionId: 'session_123',
      update: vi.fn(),
    };
    const provider: SandboxProvider<typeof sandbox> = {
      provider: 'e2b',
      provision: vi.fn().mockResolvedValue(sandbox),
      exec: vi.fn(),
      runBash: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      teardown: vi.fn(),
    };
    const composio = {
      create: vi.fn().mockResolvedValue(session),
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

    expect(provider.provision).toHaveBeenCalledWith({
      backendUrl: 'https://backend.test',
      apiKey: 'project_key',
    });
    expect(composio.create).toHaveBeenCalledWith('user_123', {
      toolkits: ['github'],
      workbench: {
        enable: true,
        sandboxSize: 'large',
      },
    });
    expect(provider.writeFile).toHaveBeenCalledWith(
      sandbox,
      '/tmp/composio-tools.ts',
      expect.stringContaining('session_123')
    );
    expect(provider.writeFile).toHaveBeenCalledWith(
      sandbox,
      '/tmp/composio-tools.ts',
      expect.stringContaining('project_key')
    );
    expect(workbench.session).toBe(session);
    expect(workbench.sandbox).toBe(sandbox);
  });

  it('tears down the sandbox and disables workbench when helper injection fails', async () => {
    const sandbox = { id: 'sandbox_123' };
    const session = {
      sessionId: 'session_123',
      update: vi.fn().mockResolvedValue(undefined),
    };
    const provider: SandboxProvider<typeof sandbox> = {
      provider: 'e2b',
      provision: vi.fn().mockResolvedValue(sandbox),
      exec: vi.fn(),
      runBash: vi.fn(),
      writeFile: vi.fn().mockRejectedValue(new Error('write failed')),
      teardown: vi.fn().mockResolvedValue(undefined),
    };
    const composio = {
      create: vi.fn().mockResolvedValue(session),
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'project_key',
        baseURL: 'https://backend.test',
      }),
    };

    await expect(
      experimental_createLocalWorkbenchSession(composio as never, 'user_123', {
        toolkits: ['github'],
        workbench: {
          enable: true,
          experimentalProvider: provider,
        },
      })
    ).rejects.toThrow('write failed');

    expect(provider.teardown).toHaveBeenCalledWith(sandbox);
    expect(session.update).toHaveBeenCalledWith({ workbench: { enable: false } });
  });
});
