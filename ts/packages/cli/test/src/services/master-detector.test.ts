import { describe, expect, it } from 'vitest';

import { detectMaster } from 'src/services/master-detector';

describe('master-detector', () => {
  it('detects codex when codex env markers are present', () => {
    expect(
      detectMaster({
        CODEX_THREAD_ID: 'thread_123',
      })
    ).toBe('codex');
  });

  it('detects claude when claude env markers are present without codex markers', () => {
    expect(
      detectMaster({
        CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
      })
    ).toBe('claude');
  });

  it('prefers codex when both codex and claude markers are present', () => {
    expect(
      detectMaster({
        CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
        CODEX_THREAD_ID: 'thread_123',
      })
    ).toBe('codex');
  });

  it('falls back to user when no known agent markers are present', () => {
    expect(detectMaster({})).toBe('user');
  });
});
