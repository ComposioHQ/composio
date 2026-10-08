import { constants } from '@composio/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_WEB_URL,
  USER_COMPOSIO_DIR,
  USER_CONFIG_FILE_NAME,
} from 'src/constants';

// `src/constants.ts` spells these out instead of importing them so the CLI never
// evaluates the core SDK's root entry at startup. This is the only place the two
// copies meet: if core changes a value, this fails instead of the CLI drifting.
describe('constants mirrored from @composio/core', () => {
  it('match the core SDK values', () => {
    expect(DEFAULT_BASE_URL).toBe(constants.DEFAULT_BASE_URL);
    expect(DEFAULT_WEB_URL).toBe(constants.DEFAULT_WEB_URL);
    expect(USER_CONFIG_FILE_NAME).toBe(constants.USER_DATA_FILE_NAME);
    expect(USER_COMPOSIO_DIR).toBe(constants.COMPOSIO_DIR);
  });
});
