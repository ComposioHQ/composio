import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { ConfigProvider, Effect } from 'effect';
import { GITHUB_CONFIG } from 'src/config';
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
  it.effect('[Given] no overrides [Then] it points at the Composio repository', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* GITHUB_CONFIG.parse(provider({})), DEFAULTS);
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
      deepStrictEqual(yield* GITHUB_CONFIG.parse(provider(env)), {
        apiBaseUrl: 'https://proxy.test',
        owner: 'fork-owner',
        repo: constants.GITHUB_REPO.REPO,
        tag: '@composio/cli@1.2.3',
        accessToken: 'ghp_test',
      });
    })
  );

  it.effect('[Given] unprefixed GITHUB_* [Then] it is ignored', () =>
    Effect.gen(function* () {
      const env = {
        GITHUB_TAG: '@composio/cli@9.9.9',
        GITHUB_OWNER: 'ci-owner',
        COMPOSIO_GITHUB_OWNER: 'fork-owner',
      };
      const config = yield* GITHUB_CONFIG.parse(provider(env));
      deepStrictEqual(config.tag, undefined);
      deepStrictEqual(config.owner, 'fork-owner');
    })
  );
});
