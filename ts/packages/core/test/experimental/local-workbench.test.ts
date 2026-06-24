import { describe, expect, it, vi } from 'vitest';
import {
  COMPOSIO_WORKBENCH_HELPER_PATH,
  experimental_createLocalWorkbenchSession,
} from '../../src/experimental';

describe('experimental_createLocalWorkbenchSession', () => {
  it('creates a Tool Router session with remote workbench disabled', async () => {
    const session = {
      sessionId: 'session_123',
    };
    const composio = {
      create: vi.fn().mockResolvedValue(session),
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'project_key',
        baseURL: 'https://backend.test/',
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
        },
      }
    );

    expect(composio.create).toHaveBeenCalledWith('user_123', {
      toolkits: ['github'],
      workbench: {
        enable: false,
        sandboxSize: 'large',
      },
    });
    expect(workbench.session).toBe(session);
    expect(workbench.env).toEqual({
      BACKEND_URL: 'https://backend.test',
      COMPOSIO_TOOLROUTER_SESSION_ID: 'session_123',
      COMPOSIO_API_KEY: 'project_key',
    });
    expect(workbench.helperSource).toContain('def run_composio_tool(');
    expect(workbench.helperSource).not.toContain('project_key');
    expect(COMPOSIO_WORKBENCH_HELPER_PATH).toBe('/tmp/composio_tools.py');
  });

  it('adds disabled workbench config when omitted by the caller', async () => {
    const session = {
      sessionId: 'session_123',
    };
    const composio = {
      create: vi.fn().mockResolvedValue(session),
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'project_key',
        baseURL: 'https://backend.test',
      }),
    };

    await experimental_createLocalWorkbenchSession(composio as never, 'user_123', {
      toolkits: ['github'],
    });

    expect(composio.create).toHaveBeenCalledWith('user_123', {
      toolkits: ['github'],
      workbench: {
        enable: false,
      },
    });
  });

  it('requires a project API key before creating the Tool Router session', async () => {
    const composio = {
      create: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        baseURL: 'https://backend.test',
      }),
    };

    await expect(
      experimental_createLocalWorkbenchSession(composio as never, 'user_123', {
        toolkits: ['github'],
      })
    ).rejects.toThrow('A Composio project API key is required');
    expect(composio.create).not.toHaveBeenCalled();
  });
});
