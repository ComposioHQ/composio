/**
 * Fixture files: one per journey, provider, and model.
 *
 *   fixtures/<journey>.<provider>.<model>.json
 *
 * The model segment of a hand-authored file is `hand-authored`; no real model
 * produced it.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_DIRECTORY = join(import.meta.dir, '..', 'fixtures');
export const HAND_AUTHORED = 'hand-authored';

export type Provider = 'anthropic' | 'openai';

export interface FixtureFile {
  readonly journeyId: string;
  readonly provider: Provider;
  readonly model: string;
  readonly path: string;
}

export const fixturePath = (journeyId: string, provider: Provider, model: string): string =>
  join(FIXTURE_DIRECTORY, `${journeyId}.${provider}.${model}.json`);

const FILE_NAME =
  /^(?<journeyId>[a-z0-9-]+)\.(?<provider>anthropic|openai)\.(?<model>[a-z0-9.-]+)\.json$/;

export const listFixtures = (): FixtureFile[] =>
  readdirSync(FIXTURE_DIRECTORY)
    .sort()
    .flatMap(name => {
      const groups = FILE_NAME.exec(name)?.groups;
      if (!groups?.journeyId || !groups.model) return [];
      return [
        {
          journeyId: groups.journeyId,
          provider: groups.provider === 'anthropic' ? ('anthropic' as const) : ('openai' as const),
          model: groups.model,
          path: join(FIXTURE_DIRECTORY, name),
        },
      ];
    });
