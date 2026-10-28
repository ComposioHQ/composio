import { describe, expect, it } from 'vitest';
import type { UnifiedToolkit } from 'src/commands/toolkits/format';
import { applyConnectedFilter } from 'src/commands/toolkits/list/toolkits.list.handler';

const row = (slug: string, status: string | null): UnifiedToolkit => ({
  name: slug,
  slug,
  description: '',
  latest_version: null,
  tools_count: 0,
  triggers_count: 0,
  is_no_auth: false,
  enabled: status === null ? null : true,
  connected:
    status === null
      ? null
      : { status, id: `ca_${slug}`, auth_scheme: 'OAUTH2', is_composio_managed: true },
});

const rows = [row('gmail', 'ACTIVE'), row('slack', 'EXPIRED'), row('github', null)];

describe('toolkits list handler: applyConnectedFilter', () => {
  it.each([
    {
      name: '--connected with session data',
      params: { connectedOnly: true, sessionLoaded: true, userResolved: true },
      slugs: ['gmail'],
      filterSkipped: false,
    },
    {
      name: '--connected, a user, and no session data',
      params: { connectedOnly: true, sessionLoaded: false, userResolved: true },
      slugs: ['gmail', 'slack', 'github'],
      filterSkipped: true,
    },
    {
      // Already warned about: `--connected` needs a user id.
      name: '--connected and no user',
      params: { connectedOnly: true, sessionLoaded: false, userResolved: false },
      slugs: ['gmail', 'slack', 'github'],
      filterSkipped: false,
    },
    {
      name: 'no --connected',
      params: { connectedOnly: false, sessionLoaded: true, userResolved: true },
      slugs: ['gmail', 'slack', 'github'],
      filterSkipped: false,
    },
  ])('[Given] $name [Then] keeps $slugs', ({ params, slugs, filterSkipped }) => {
    const result = applyConnectedFilter(rows, params);

    expect(result.rows.map(r => r.slug)).toEqual(slugs);
    expect(result.filterSkipped).toBe(filterSkipped);
  });
});
