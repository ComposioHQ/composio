/**
 * The person model, without a container: what makes them approve, and when
 * they say so.
 */

import { describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  GLOBAL_TEST_USER_ID,
  World,
} from '@e2e-tests/cli-fake-backend';
import { PERSON_REPLY, personFor } from './src/person';
import { SCRUBBED_BACKEND_URL, SCRUBBED_DASHBOARD_URL } from './src/scrub';

const start = () => {
  const world = new World();
  // Nothing completes by waiting, as in a journey.
  world.linkCompletesAfterPolls = null;
  const person = personFor(world, {
    dashboard: SCRUBBED_DASHBOARD_URL,
    backend: SCRUBBED_BACKEND_URL,
  });
  return { world, person };
};

const loginUrl = (id: string) => `${SCRUBBED_DASHBOARD_URL}?cliKey=${id}`;
const authorizationUrl = (id: string) => `${SCRUBBED_BACKEND_URL}/api/v3/s/${id}`;

describe('what the person approves', () => {
  it('approves a login whose complete URL the agent wrote', () => {
    const { world, person } = start();
    const session = world.createLoginSession();
    person.hear(`Open ${loginUrl(session.id)} to log in.`, false);
    expect(session.status).toBe('linked');
  });

  it('reads a URL through markdown and trailing punctuation', () => {
    const { world, person } = start();
    const first = world.createLoginSession();
    const second = world.createLoginSession();
    person.hear(`[Log in](${loginUrl(first.id)}), or: **${loginUrl(second.id)}**.`, false);
    expect([first.status, second.status]).toEqual(['linked', 'linked']);
  });

  it('does not approve a login from its id alone', () => {
    const { world, person } = start();
    const session = world.createLoginSession();
    person.hear(`Debug session id: ${session.id}`, true);
    expect(session.status).toBe('pending');
  });

  it('does not approve a login whose id is followed by more characters', () => {
    const { world, person } = start();
    const session = world.createLoginSession();
    person.hear(`Open ${loginUrl(session.id)}0 to log in.`, true);
    expect(session.status).toBe('pending');
  });

  it('does not approve an authorization page on another host', () => {
    const { world, person } = start();
    const connection = world.beginConnection({
      projectLabel: DEVELOPER_PROJECT.label,
      userId: GLOBAL_TEST_USER_ID,
      toolkit: 'slack',
    });
    person.hear(`Authorize here: https://wrong.invalid/api/v3/s/${connection.id}`, true);
    expect(connection.status).toBe('INITIATED');
  });

  it('does not recognise a URL written without its scheme', () => {
    const { world, person } = start();
    const session = world.createLoginSession();
    person.hear(`Open ${loginUrl(session.id).replace('https://', '')}`, true);
    expect(session.status).toBe('pending');
  });
});

describe('when the person says they approved', () => {
  it('answers an agent that stopped to wait, once', () => {
    const { world, person } = start();
    const connection = world.beginConnection({
      projectLabel: CONSUMER_PROJECT.label,
      userId: CONSUMER_USER_ID,
      toolkit: 'slack',
    });
    const message = `Please authorize Slack: ${authorizationUrl(connection.id)}`;
    expect(person.hear(message, true)).toBe(PERSON_REPLY);
    expect(connection.status).toBe('ACTIVE');
    // The agent thanks them and stops again without checking: nothing new to say.
    expect(person.hear('Thanks, Slack is connected.', true)).toBeUndefined();
  });

  it('answers later when the URL came beside a command and the agent stops afterwards', () => {
    const { world, person } = start();
    const connection = world.beginConnection({
      projectLabel: CONSUMER_PROJECT.label,
      userId: CONSUMER_USER_ID,
      toolkit: 'slack',
    });
    expect(person.hear(`Authorize: ${authorizationUrl(connection.id)}`, false)).toBeUndefined();
    // A turn of unrelated commands, with nothing written.
    expect(person.hear('', false)).toBeUndefined();
    expect(person.hear('Tell me once you have authorized Slack.', true)).toBe(PERSON_REPLY);
  });

  it('stays quiet once a command of the agent saw the approval', () => {
    const { world, person } = start();
    const session = world.createLoginSession();
    expect(person.hear(`Log in at ${loginUrl(session.id)}`, false)).toBeUndefined();
    // `composio login --poll` in the same turn reads the linked session.
    session.reportedLinked = true;
    expect(person.hear('You are logged in.', true)).toBeUndefined();
  });

  it('says so after approving a page the CLI opened in their browser', () => {
    const { world, person } = start();
    const connection = world.beginConnection({
      projectLabel: CONSUMER_PROJECT.label,
      userId: CONSUMER_USER_ID,
      toolkit: 'slack',
    });
    world.authorizeConnection(connection.id);
    expect(person.hear('I opened the page in your browser. Tell me when done.', true)).toBe(
      PERSON_REPLY
    );
  });

  it('has nothing to say about a connection that existed before the agent started', () => {
    const { world, person } = start();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    expect(person.hear('All done.', true)).toBeUndefined();
  });
});
