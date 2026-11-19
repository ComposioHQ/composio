/**
 * The seeded world, without a container: every rig starts from the same
 * state, and that state is pinned, so a change to the seed is a decision and
 * not a drift. `pass^k` compares attempts of one journey; it means nothing if
 * they did not start alike.
 */

import { describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  World,
  worldHash,
  type Connection,
} from '@e2e-tests/cli-fake-backend';

/**
 * `worldHash(new World())`. Update it in the change that alters the seed, and
 * say in that change why: every earlier eval batch was run against the old one.
 */
const SEEDED_WORLD_HASH = '7621fa4ed357c514';

describe('the seeded world', () => {
  it('hashes the same in every new instance', () => {
    expect(worldHash(new World())).toBe(worldHash(new World()));
  });

  it('is the pinned seed', () => {
    expect(worldHash(new World())).toBe(SEEDED_WORLD_HASH);
  });

  it('ignores the deployment’s user API key, which no request changes', () => {
    // A digest of a credential is a password hash to any reader, and the key is
    // fixed per rig, so it is not state two runs are compared by.
    expect(worldHash(new World({ userApiKey: 'uk_e2e_another_deployment' }))).toBe(
      worldHash(new World())
    );
  });
});

describe('worldHash', () => {
  it('does not depend on the order of an object’s keys', () => {
    const world = new World();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    const before = worldHash(world);
    const [connection] = world.connections;
    world.connections[0] = Object.fromEntries(Object.entries(connection!).reverse()) as Connection;
    expect(worldHash(world)).toBe(before);
  });

  // One change per kind of state a request can leave behind.
  const changes: ReadonlyArray<[string, (world: World) => void]> = [
    [
      'a connection',
      world => void world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack'),
    ],
    ['an auth config', world => void world.authConfigForToolkit(CONSUMER_PROJECT.label, 'slack')],
    ['a login session', world => void world.createLoginSession()],
    [
      'a tool-router session',
      world => void world.createToolRouterSession(DEVELOPER_PROJECT.label, CONSUMER_USER_ID),
    ],
    ['a minted project key', world => void world.mintProjectKey(DEVELOPER_PROJECT.label, 'e2e')],
    [
      'a release',
      world => void world.releases.push({ tag: 'v0.0.1', prerelease: false, assets: [] }),
    ],
    ['how links complete', world => void (world.linkCompletesAfterPolls = null)],
    ['a tool execution', world => void world.nextLogId()],
  ];

  for (const [name, change] of changes) {
    it(`changes with ${name}`, () => {
      const world = new World();
      change(world);
      expect(worldHash(world)).not.toBe(worldHash(new World()));
    });
  }

  it('changes when a connection’s status does', () => {
    const world = new World();
    const pending = world.beginConnection({
      projectLabel: CONSUMER_PROJECT.label,
      userId: CONSUMER_USER_ID,
      toolkit: 'slack',
    });
    const before = worldHash(world);
    world.authorizeConnection(pending.id);
    expect(worldHash(world)).not.toBe(before);
  });
});
