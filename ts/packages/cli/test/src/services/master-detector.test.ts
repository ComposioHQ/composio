import { describe, expect, it } from 'vitest';

import { detectMaster } from 'src/services/master-detector';

describe('master-detector', () => {
  it('detects codex when codex env markers are present', () => {
    expect(
      detectMaster({
        codex: true,
        claude: false,
      })
    ).toBe('codex');
  });

  it('detects claude when claude env markers are present without codex markers', () => {
    expect(
      detectMaster({
        codex: false,
        claude: true,
      })
    ).toBe('claude');
  });

  it('prefers codex when both codex and claude markers are present', () => {
    expect(
      detectMaster({
        codex: true,
        claude: true,
      })
    ).toBe('codex');
  });

  it('falls back to user when no known agent markers are present', () => {
    expect(detectMaster({ codex: false, claude: false })).toBe('user');
  });
});
