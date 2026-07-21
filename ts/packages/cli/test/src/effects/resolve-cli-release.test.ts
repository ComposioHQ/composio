import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { HttpClient, HttpClientResponse } from '@effect/platform';
import { fetchLatestCliRelease, type GitHubRelease } from 'src/effects/resolve-cli-release';

const githubConfig = {
  API_BASE_URL: 'https://api.github.test',
  OWNER: 'ComposioHQ',
  REPO: 'composio',
};

const stubHttpClient = (body: unknown) =>
  HttpClient.make(request =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  );

const hasRequiredAsset = (release: GitHubRelease) =>
  release.assets.some(asset => asset.name === 'composio-darwin-arm64');

describe('fetchLatestCliRelease', () => {
  it.effect('skips malformed release entries instead of failing resolution', () =>
    Effect.gen(function* () {
      const malformedDraft = {
        tag_name: '@composio/cli@0.3.0',
        draft: true,
        assets: [{ name: 'composio-darwin-arm64', browser_download_url: null }],
      };
      const wellFormed = {
        tag_name: '@composio/cli@0.2.9',
        prerelease: false,
        assets: [
          { name: 'composio-darwin-arm64', browser_download_url: 'https://example.test/cli' },
        ],
      };
      const unrelated = { something: 'else entirely' };

      const latest = yield* fetchLatestCliRelease({
        assetDescription: 'darwin-arm64 binary',
        channel: 'stable',
        githubConfig,
        hasRequiredAsset,
        httpClient: stubHttpClient([malformedDraft, unrelated, wellFormed]),
      });

      expect(latest.tag_name).toBe('@composio/cli@0.2.9');
    })
  );

  it.effect('still fails with a decode error when the body is not an array', () =>
    Effect.gen(function* () {
      const failure = yield* fetchLatestCliRelease({
        assetDescription: 'darwin-arm64 binary',
        channel: 'stable',
        githubConfig,
        hasRequiredAsset,
        httpClient: stubHttpClient({ message: 'rate limited' }),
      }).pipe(Effect.flip);

      expect(failure.reason).toBe('decode');
    })
  );

  it.effect('reports not-found when every entry is malformed', () =>
    Effect.gen(function* () {
      const failure = yield* fetchLatestCliRelease({
        assetDescription: 'darwin-arm64 binary',
        channel: 'stable',
        githubConfig,
        hasRequiredAsset,
        httpClient: stubHttpClient([{ tag_name: '' }, { assets: 'nope' }]),
      }).pipe(Effect.flip);

      expect(failure.reason).toBe('not-found');
    })
  );
});
