import { describe, expect, it, vi } from 'vitest';
import { experimental_createLocalWorkbenchSession } from '../../src/workbench';

function makeComposio(config: { apiKey?: string; baseURL?: string }) {
  return {
    getConfig: vi.fn().mockReturnValue(config),
  };
}

describe('experimental_createLocalWorkbenchSession', () => {
  it('returns helperSource + env for a session with the remote workbench disabled', async () => {
    const session = {
      sessionId: 'session_123',
      workbench: { enable: false },
    };
    const composio = makeComposio({
      apiKey: 'project_key',
      baseURL: 'https://backend.test/',
    });

    const workbench = await experimental_createLocalWorkbenchSession(
      composio as never,
      session as never
    );

    expect(workbench.env).toEqual({
      BACKEND_URL: 'https://backend.test',
      COMPOSIO_TOOLROUTER_SESSION_ID: 'session_123',
      COMPOSIO_API_KEY: 'project_key',
    });
    expect(workbench.helperSource).toContain('def run_composio_tool(');
    expect(workbench.helperSource).not.toContain('project_key');
    // The breaking change: no `session` is returned anymore.
    expect('session' in workbench).toBe(false);
  });

  it('throws when the session has the remote workbench enabled', async () => {
    const session = {
      sessionId: 'session_123',
      workbench: { enable: true },
    };
    const composio = makeComposio({
      apiKey: 'project_key',
      baseURL: 'https://backend.test',
    });

    await expect(
      experimental_createLocalWorkbenchSession(composio as never, session as never)
    ).rejects.toThrow('requires a session created with workbench.enable: false');
  });

  it('throws when the session has no workbench config (defaults to remote)', async () => {
    const session = {
      sessionId: 'session_123',
    };
    const composio = makeComposio({
      apiKey: 'project_key',
      baseURL: 'https://backend.test',
    });

    await expect(
      experimental_createLocalWorkbenchSession(composio as never, session as never)
    ).rejects.toThrow('requires a session created with workbench.enable: false');
  });

  it('requires a project API key', async () => {
    const session = {
      sessionId: 'session_123',
      workbench: { enable: false },
    };
    const composio = makeComposio({
      baseURL: 'https://backend.test',
    });

    await expect(
      experimental_createLocalWorkbenchSession(composio as never, session as never)
    ).rejects.toThrow('A Composio project API key is required');
  });
});
