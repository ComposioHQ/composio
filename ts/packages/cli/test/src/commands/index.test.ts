import { describe, expect, it } from 'vitest';
import { parseExecuteInputHelpSlug } from 'src/commands';

describe('execute input-help routing', () => {
  it('does not mistake value-taking option values for the slug', () => {
    expect(
      parseExecuteInputHelpSlug([
        'bun',
        'composio',
        'execute',
        '--account',
        'default',
        '--file',
        './input.txt',
        'GMAIL_SEND_EMAIL',
        '--help',
      ])
    ).toBe('GMAIL_SEND_EMAIL');
  });

  it('does not treat the parallel flag as a value-taking option', () => {
    expect(
      parseExecuteInputHelpSlug([
        'bun',
        'composio',
        'execute',
        '--parallel',
        'GMAIL_SEND_EMAIL',
        '-d',
        '{}',
        'GITHUB_CREATE_AN_ISSUE',
        '--help',
      ])
    ).toBe('GMAIL_SEND_EMAIL');
  });
});
