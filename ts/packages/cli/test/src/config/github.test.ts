import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { ConfigProvider, Effect } from 'effect';
import { GITHUB_CONFIG, GITHUB_REPAIR_CONFIG } from 'src/config';
import * as constants from 'src/constants';

const provider = (env: Record<string, string>) => ConfigProvider.fromEnvRecord(env);

const DEFAULTS = {
  apiBaseUrl: constants.GITHUB_REPO.API_BASE_URL,
  owner: constants.GITHUB_REPO.OWNER,
  repo: constants.GITHUB_REPO.REPO,
  tag: undefined,
  accessToken: undefined,
};

describe('GITHUB_CONFIG', () => {
  it.effect('[Given] no overrides [Then] both configs point at the Composio repository', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* GITHUB_CONFIG.parse(provider({})), DEFAULTS);
      deepStrictEqual(yield* GITHUB_REPAIR_CONFIG.parse(provider({})), DEFAULTS);
    })
  );

  it.effect('[Given] COMPOSIO_GITHUB_* [Then] releases are fetched from the override', () =>
    Effect.gen(function* () {
      const env = {
        COMPOSIO_GITHUB_API_BASE_URL: 'https://proxy.test',
        COMPOSIO_GITHUB_OWNER: 'fork-owner',
        COMPOSIO_GITHUB_REPO: '',
        COMPOSIO_GITHUB_TAG: '@composio/cli@1.2.3',
        COMPOSIO_GITHUB_ACCESS_TOKEN: 'ghp_test',
      };
      const expected = {
        apiBaseUrl: 'https://proxy.test',
        owner: 'fork-owner',
        repo: constants.GITHUB_REPO.REPO,
        tag: '@composio/cli@1.2.3',
        accessToken: 'ghp_test',
      };
      deepStrictEqual(yield* GITHUB_CONFIG.parse(provider(env)), expected);
      deepStrictEqual(yield* GITHUB_REPAIR_CONFIG.parse(provider(env)), expected);
    })
  );

  it.effect('[Given] unprefixed GITHUB_* [Then] only self-repair honors it, and first', () =>
    Effect.gen(function* () {
      const env = {
        GITHUB_TAG: '@composio/cli@9.9.9',
        GITHUB_OWNER: 'ci-owner',
        COMPOSIO_GITHUB_OWNER: 'fork-owner',
      };
      const upgrade = yield* GITHUB_CONFIG.parse(provider(env));
      deepStrictEqual(upgrade.tag, undefined);
      deepStrictEqual(upgrade.owner, 'fork-owner');
      const repair = yield* GITHUB_REPAIR_CONFIG.parse(provider(env));
      deepStrictEqual(repair.tag, '@composio/cli@9.9.9');
      deepStrictEqual(repair.owner, 'ci-owner');
    })
  );
});
