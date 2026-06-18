import { describe, expect, it } from 'vitest';
import { canRenderTerminalDecoration, isInteractiveTerminal } from 'src/utils/stdio';

describe('stdio helpers', () => {
  it('requires all streams to be TTYs for interactive prompts', () => {
    expect(
      isInteractiveTerminal({
        stdin: { isTTY: false },
        stdout: { isTTY: true },
        stderr: { isTTY: true },
      })
    ).toBe(false);
  });

  it('allows terminal decoration when only stderr is a TTY', () => {
    expect(
      canRenderTerminalDecoration({
        stdin: { isTTY: false },
        stdout: { isTTY: true },
        stderr: { isTTY: true },
      })
    ).toBe(true);
  });

  it('suppresses terminal decoration when stderr is not a TTY', () => {
    expect(
      canRenderTerminalDecoration({
        stdin: { isTTY: true },
        stdout: { isTTY: true },
        stderr: { isTTY: false },
      })
    ).toBe(false);
  });
});
