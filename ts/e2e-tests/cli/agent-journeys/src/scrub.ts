/**
 * Makes command output repeatable before a model sees it.
 *
 * A fixture is matched against the conversation, so anything that differs
 * between two runs of the same journey (a port, a temporary directory, a clock
 * reading) would make a replay miss. The fake backend already fixes ids and
 * timestamps; this removes what the machine adds.
 */

import { SEEDED_AT, SEEDED_EXPIRY, type FakeComposio } from '@e2e-tests/cli-fake-backend';

/** Stable stand-ins for the fake's per-run URLs. */
export const SCRUBBED_BACKEND_URL = 'https://backend.composio.test';
export const SCRUBBED_DASHBOARD_URL = 'https://dashboard.composio.test';

const HEAD_CHARACTERS = 2500;
const TAIL_CHARACTERS = 1500;
const SEEDED_TIMESTAMPS = new Set([SEEDED_AT, SEEDED_EXPIRY]);

/** Keeps both ends: a parse error sits under a page of help, at the very end. */
const truncate = (text: string): string =>
  text.length <= HEAD_CHARACTERS + TAIL_CHARACTERS
    ? text
    : `${text.slice(0, HEAD_CHARACTERS)}\n[... ${text.length - HEAD_CHARACTERS - TAIL_CHARACTERS} characters omitted ...]\n${text.slice(-TAIL_CHARACTERS)}`;

export const scrub = (text: string, fake: FakeComposio): string =>
  truncate(
    text
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replaceAll(fake.docker.https, SCRUBBED_DASHBOARD_URL)
      .replaceAll(fake.docker.http, SCRUBBED_BACKEND_URL)
      .replace(/composio-run-artifacts-[A-Za-z0-9]+/g, 'composio-run-artifacts-SCRUBBED')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, timestamp =>
        SEEDED_TIMESTAMPS.has(timestamp) ? timestamp : '<timestamp>'
      )
      .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/g, '[<time>]')
      .replace(/composio-cli-\d{4}-\d{2}-\d{2}/g, 'composio-cli-<date>')
  );
