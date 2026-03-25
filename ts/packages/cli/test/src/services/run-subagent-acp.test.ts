import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferedChunkLogger, resolveAcpAdapterCommand } from 'src/services/run-subagent-acp';
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

  it('[Given] a cancelled ACP prompt [Then] it remains fallback-eligible', () => {
    const error = new AcpInvokeError('prompt_failed', 'claude ACP prompt was cancelled.');

    expect(isAcpInvokeError(error)).toBe(true);
    expect(error.code).toBe('prompt_failed');
  });

  it('[Given] tokenized message chunks [Then] it emits buffered readable text', () => {
    const helperDebugLog = vi.fn();
    const logger = new BufferedChunkLogger('subAgent.acp.message', helperDebugLog);

    logger.push('Pick');
    logger.push(' one');
    logger.push(' fruit');
    logger.push(' from');
    logger.push(' the');
    logger.push(' mixed');
    logger.push(' box.');
    logger.flush();

    expect(helperDebugLog).toHaveBeenCalledWith('subAgent.acp.message', {
      text: 'Pick one fruit from the mixed box.',
    });
  });
});
