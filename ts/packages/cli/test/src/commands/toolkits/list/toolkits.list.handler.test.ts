import { describe, expect, it } from 'vitest';
import { Option } from 'effect';
import type { UnifiedToolkit } from 'src/commands/toolkits/format';
import {
  applyConnectedFilter,
  resolveToolkitsListUser,
} from 'src/commands/toolkits/list/toolkits.list.handler';

describe('toolkits list handler: resolveToolkitsListUser', () => {
  // `--user-id` wins, then the directory's test user, then the global one; only a fallback is announced.
  it.each([
    {
      name: '--user-id and both test users',
      flag: Option.some('alice'),
      projectTestUserId: Option.some('project-user'),
      globalTestUserId: Option.some('global-user'),
      expected: Option.some({ id: 'alice', fallbackNotice: Option.none() }),
    },
    {
      name: 'the directory and the global test user',
      flag: Option.none(),
      projectTestUserId: Option.some('project-user'),
      globalTestUserId: Option.some('global-user'),
      expected: Option.some({
        id: 'project-user',
        fallbackNotice: Option.some('Using test user id "project-user"'),
      }),
    },
    {
      name: 'only the global test user',
      flag: Option.none(),
      projectTestUserId: Option.none(),
      globalTestUserId: Option.some('global-user'),
      expected: Option.some({
        id: 'global-user',
        fallbackNotice: Option.some('Using global test user id "global-user"'),
      }),
    },
    {
      name: 'no user anywhere',
      flag: Option.none(),
      projectTestUserId: Option.none(),
      globalTestUserId: Option.none(),
      expected: Option.none(),
    },
  ])(
    '[Given] $name [Then] resolves the expected user',
    ({ name: _name, expected, ...candidates }) => {
      expect(resolveToolkitsListUser(candidates)).toEqual(expected);
    }
  );
});

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
