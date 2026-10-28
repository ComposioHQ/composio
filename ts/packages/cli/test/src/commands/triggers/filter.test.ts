import { describe, expect, it } from '@effect/vitest';
import { matchesTriggerListenFilters } from 'src/commands/triggers/filter';
import type { TriggerListenEvent } from 'src/commands/triggers/types';

// Mirrors `parseTriggerListenEvent`: payloads carry no toolkit slug, so the
// toolkit is the trigger slug's first `_` segment.
const eventFor = (triggerSlug: string): TriggerListenEvent => {
  const toolkitSlug = triggerSlug.split('_')[0]?.toUpperCase() ?? 'UNKNOWN';
  return {
    id: 'ti_abc',
    uuid: 'ti_abc',
    triggerSlug,
    toolkitSlug,
    userId: 'user-1',
    payload: {},
    originalPayload: {},
    metadata: {
      id: 'ti_abc',
      uuid: 'ti_abc',
      toolkitSlug,
      triggerSlug,
      triggerConfig: {},
      connectedAccount: {
        id: 'ca_abc',
        uuid: 'ca_abc',
        authConfigId: 'ac_abc',
        authConfigUUID: 'ac_abc',
        userId: 'user-1',
        status: 'ACTIVE',
      },
    },
  };
};

describe('matchesTriggerListenFilters', () => {
  describe('[Given] a --toolkits filter', () => {
    it('[Then] matches the toolkit derived from the trigger slug, case-insensitively', () => {
      const event = eventFor('GMAIL_NEW_GMAIL_MESSAGE');

      expect(matchesTriggerListenFilters({ toolkits: ['gmail'] }, event)).toBe(true);
      expect(matchesTriggerListenFilters({ toolkits: ['GMAIL'] }, event)).toBe(true);
      expect(matchesTriggerListenFilters({ toolkits: ['slack'] }, event)).toBe(false);
    });

    // `one_drive`, `launch_darkly` and `agent_mail` contain an underscore, so the
    // derived toolkit is `ONE`, not `ONE_DRIVE` (#4947).
    it.each([
      ['one_drive', 'ONE_DRIVE_FILE_CREATED_TRIGGER'],
      ['ONE_DRIVE', 'ONE_DRIVE_FILE_CREATED_TRIGGER'],
      ['launch_darkly', 'LAUNCH_DARKLY_FLAG_UPDATED'],
      ['agent_mail', 'AGENT_MAIL_MESSAGE_RECEIVED'],
    ])('[Then] matches %s, whose slug contains an underscore, on %s', (toolkit, triggerSlug) => {
      expect(matchesTriggerListenFilters({ toolkits: [toolkit] }, eventFor(triggerSlug))).toBe(
        true
      );
    });

    it('[Then] does not match a toolkit that only shares a prefix with the trigger slug', () => {
      expect(
        matchesTriggerListenFilters(
          { toolkits: ['one_drive'] },
          eventFor('ONE_DRIVEX_FILE_CREATED')
        )
      ).toBe(false);
    });
  });
});
