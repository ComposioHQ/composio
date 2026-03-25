import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAcpAdapterCommand } from 'src/services/run-subagent-acp';
import { AcpInvokeError, isAcpInvokeError } from 'src/services/run-subagent-shared';

describe('run-subagent-acp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[Given] bundled adapter packages [Then] it resolves to the bundled path without npx', () => {
    const result = resolveAcpAdapterCommand('claude');
    expect(result.source).toBe('bundled');
    expect(result.cmd[0]).toBe(process.execPath);
    expect(result.cmd[1]).toMatch(/claude-code-acp/);
  });

  it('[Given] bundled codex adapter [Then] it resolves to the bundled path', () => {
    const result = resolveAcpAdapterCommand('codex');
    expect(result.source).toBe('bundled');
    expect(result.cmd[0]).toBe(process.execPath);
    expect(result.cmd[1]).toMatch(/codex-acp/);
  });

  it('[Given] an ACP invoke error [Then] it is classified for fallback', () => {
    const error = new AcpInvokeError('initialize_failed', 'boom');
    expect(isAcpInvokeError(error)).toBe(true);
    expect(error.code).toBe('initialize_failed');
  });

  it('[Given] an ACP-like error from another bundle [Then] it is still classified for fallback', () => {
    const error = {
      name: 'AcpInvokeError',
      code: 'prompt_failed',
      message: 'boom',
    };

    expect(isAcpInvokeError(error)).toBe(true);
  });
});
