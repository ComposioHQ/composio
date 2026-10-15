import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { schemaLoaders } from '@composio/client/effect/schemas';
import { composioSchemaLoaders } from 'src/services/composio-schema-loaders';

const clientLoaders: Readonly<Record<string, (() => Promise<unknown>) | undefined>> = schemaLoaders;
const cliLoaders: ReadonlyArray<readonly [string, () => Promise<unknown>]> =
  Object.entries(composioSchemaLoaders);

describe('composioSchemaLoaders', () => {
  it('only names operations the client has a response schema for', () => {
    const unknown = cliLoaders.map(([key]) => key).filter(key => clientLoaders[key] === undefined);

    expect(unknown).toEqual([]);
  });

  it.effect.each(cliLoaders)('loads the response schema of %s', ([key, load]) =>
    Effect.gen(function* () {
      const expected = yield* Effect.promise(() => clientLoaders[key]!());
      const loaded = yield* Effect.promise(load);

      expect(loaded).toBe(expected);
    })
  );
});
