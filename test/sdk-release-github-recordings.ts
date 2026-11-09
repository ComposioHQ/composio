import { Schema } from 'effect';
import { REPOSITORY_PATH } from '../scripts/sdk-release/github';
import { FIXTURE_DIRECTORY, Recording } from '../scripts/sdk-release/record-github-fixtures';
import { json, type Fetch } from './sdk-release-harness';

/** Release #5278, the first stable release published by the unified workflow. */
export const RELEASE_5278 = {
  pull: 5278,
  id: '42589989280',
  head: '3daade4191744c2f092e42ecca0e763fe11c7fa9',
  appSlug: 'sdkrelease',
} as const;

/** The responses recorded for one release, in a stable order. */
export const loadRecordings = async (id: string = RELEASE_5278.id) => {
  const directory = `${FIXTURE_DIRECTORY}/release-${id}`;
  const files = [...new Bun.Glob('*.json').scanSync(directory)].toSorted();
  return Promise.all(
    files.map(async file =>
      Schema.decodeUnknownSync(Recording)(await Bun.file(`${directory}/${file}`).json())
    )
  );
};

/** Replaces one recorded response, keyed by its path below the repository. */
export type Override = (recorded: unknown) => Response;

/**
 * A fake GitHub API that answers recorded GETs exactly as GitHub did and records every write.
 * An unrecorded read fails the request, so a test cannot pass on a response nobody saw.
 */
export const replay = (
  recordings: ReadonlyArray<Recording>,
  overrides: Record<string, Override> = {}
) => {
  const recorded = new Map(recordings.map(recording => [recording.path, recording.body]));
  const writes: { method: string; path: string; body: unknown }[] = [];
  const fetcher: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    const local = path.replace(REPOSITORY_PATH, '');
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      const body: unknown = JSON.parse(String(init?.body));
      writes.push({ method, path: local, body });
      return json({ id: 1, ...(body as object) });
    }
    if (local in overrides) return overrides[local](recorded.get(path));
    if (!recorded.has(path)) throw new Error(`Unrecorded read ${path}`);
    const body = recorded.get(path);
    return typeof body === 'string' ? new Response(body) : json(body);
  };
  return { fetcher, writes };
};

/**
 * #5278 ran before the `SDK candidate docs` job existed, so its recorded checks lack it. The
 * recorded `typescript-check` run stands in for it, under the new name and a newer id.
 */
export const withCandidateDocs: Record<string, Override> = {
  [`/commits/${RELEASE_5278.head}/check-runs?per_page=100&page=2`]: recorded => {
    const body = recorded as { check_runs: ReadonlyArray<{ id: number; name: string }> };
    const docs = body.check_runs.find(check => check.name === 'typescript-check');
    return json({
      ...body,
      check_runs: [
        ...body.check_runs,
        { ...docs, id: Number(docs?.id) + 1, name: 'SDK candidate docs' },
      ],
    });
  },
};

/** Folds bodies into one shape: objects keep every key seen, arrays every item shape seen. */
const mergeShape = (left: unknown, right: unknown): unknown => {
  if (left === null || left === undefined) return right;
  if (right === null || right === undefined) return left;
  if (Array.isArray(left) && Array.isArray(right)) {
    const items = [...left, ...right];
    return items.length ? [items.reduce(mergeShape)] : [];
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const merged: Record<string, unknown> = { ...(left as Record<string, unknown>) };
    for (const [key, value] of Object.entries(right as Record<string, unknown>))
      merged[key] = mergeShape(merged[key], value);
    return merged;
  }
  return left;
};

export const recordedShape = (bodies: ReadonlyArray<unknown>) => bodies.reduce(mergeShape, null);

/**
 * Paths in `fixture` that GitHub's recorded responses never had: a key it does not send, an item
 * where it sent none, or a value of another type. `null` on either side matches anything, since
 * GitHub sends `null` for unset values of every type.
 */
export const unrecordedPaths = (fixture: unknown, shape: unknown, at = '$'): string[] => {
  if (fixture === null || shape === null) return [];
  if (Array.isArray(fixture)) {
    if (!Array.isArray(shape)) return [at];
    if (!fixture.length) return [];
    if (!shape.length) return [`${at}[]`];
    return fixture.flatMap((item, index) => unrecordedPaths(item, shape[0], `${at}[${index}]`));
  }
  if (typeof fixture === 'object') {
    if (typeof shape !== 'object' || Array.isArray(shape)) return [at];
    const known = shape as Record<string, unknown>;
    return Object.entries(fixture as Record<string, unknown>).flatMap(([key, value]) =>
      key in known ? unrecordedPaths(value, known[key], `${at}.${key}`) : [`${at}.${key}`]
    );
  }
  return typeof fixture === typeof shape ? [] : [at];
};
