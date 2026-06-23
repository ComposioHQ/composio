import { beforeEach, describe, expect, it, vi } from 'vitest';
import { experimental_e2bSandbox } from '../src';

const createMock = vi.fn();
const writeMock = vi.fn();
const killMock = vi.fn();
const runCodeMock = vi.fn();
const commandRunMock = vi.fn();

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: createMock,
  },
}));

describe('experimental_e2bSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeMock.mockResolvedValue(undefined);
    killMock.mockResolvedValue(undefined);
    commandRunMock.mockResolvedValue({ stdout: 'ok', exitCode: 0 });
    runCodeMock.mockImplementation(async () => {
      const response = await fetch(
        'https://backend.test/api/v3/tool_router/session/session_123/execute',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'project_key',
          },
          body: JSON.stringify({
            tool_slug: 'GITHUB_GET_REPO',
            arguments: { owner: 'ComposioHQ', repo: 'composio' },
          }),
        }
      );
      return { json: await response.json() };
    });
    createMock.mockResolvedValue({
      files: { write: writeMock },
      runCode: runCodeMock,
      commands: { run: commandRunMock },
      kill: killMock,
    });
  });

  it('provisions e2b and round-trips runComposioTool through /execute', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: { ok: true } }),
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = experimental_e2bSandbox({ apiKey: 'e2b_key' });
    const handle = await provider.provision({
      sessionId: 'session_123',
      backendUrl: 'https://backend.test',
      apiKey: 'project_key',
    });

    expect(createMock).toHaveBeenCalledWith({
      apiKey: 'e2b_key',
      envs: {
        BACKEND_URL: 'https://backend.test',
        COMPOSIO_TOOLROUTER_SESSION_ID: 'session_123',
        COMPOSIO_API_KEY: 'project_key',
      },
    });
    expect(writeMock).toHaveBeenCalledWith(
      '/tmp/composio-tools.ts',
      expect.stringContaining('/execute')
    );

    const result = await provider.exec(
      handle,
      "import { runComposioTool } from '/tmp/composio-tools.ts'; await runComposioTool('GITHUB_GET_REPO', {});"
    );

    expect(result.json).toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.test/api/v3/tool_router/session/session_123/execute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'project_key',
        }),
      })
    );
  });
});
