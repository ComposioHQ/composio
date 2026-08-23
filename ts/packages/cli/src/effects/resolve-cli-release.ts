import { Data, Effect, Option, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from '@effect/platform';
import { semverComparator } from 'src/effects/compare-semver';
import type { CliReleaseChannel } from 'src/constants';

export const GitHubReleaseAsset = Schema.Struct({
  name: Schema.NonEmptyString,
  browser_download_url: Schema.NonEmptyString,
  // Present on every real GitHub asset; optional so a release payload that omits
  // it still decodes and the download simply reports progress without a total.
  size: Schema.optional(Schema.Number),
});
export type GitHubReleaseAsset = typeof GitHubReleaseAsset.Type;
export const GitHubReleaseAssets = Schema.Array(GitHubReleaseAsset);

export const GitHubRelease = Schema.Struct({
  tag_name: Schema.NonEmptyString,
  prerelease: Schema.optional(Schema.Boolean),
  draft: Schema.optional(Schema.Boolean),
  assets: GitHubReleaseAssets,
});
export type GitHubRelease = typeof GitHubRelease.Type;

// Decoded per element: the endpoint returns up to 100 releases spanning the
// whole repo, and one deviant entry (a draft mid-upload with a null asset
// URL) must not fail resolution for the well-formed CLI releases.
const RawGitHubReleases = Schema.Array(Schema.Unknown);
const decodeGitHubRelease = Schema.decodeUnknownOption(GitHubRelease);

export class CliReleaseResolutionError extends Data.TaggedError(
  'effects/CliReleaseResolutionError'
)<{
  readonly cause?: unknown;
  readonly message: string;
  readonly reason: 'request' | 'http-status' | 'decode' | 'not-found' | 'compare';
  readonly status?: number;
}> {}

export type GitHubRepoConfig = {
  API_BASE_URL: string;
  OWNER: string;
  REPO: string;
};

export const CLI_RELEASE_TAG_PATTERN = /^@composio\/cli@\d+\.\d+\.\d+.*$/;

const GitHubReleaseByTag = Schema.Struct({ assets: GitHubReleaseAssets });

export const fetchCliReleaseByTag = ({
  githubConfig,
  httpClient,
  tag,
}: {
  githubConfig: GitHubRepoConfig;
  httpClient: HttpClient.HttpClient;
  tag: string;
}) =>
  Effect.gen(function* () {
    const releaseUrl = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${encodeURIComponent(tag)}`;
    const releaseResponse = yield* httpClient.get(releaseUrl).pipe(
      Effect.mapError(
        cause =>
          new CliReleaseResolutionError({
            cause,
            message: `Failed to fetch release ${tag}`,
            reason: 'request',
          })
      )
    );

    if (releaseResponse.status < 200 || releaseResponse.status >= 300) {
      return yield* new CliReleaseResolutionError({
        message: `Release ${tag} not found (HTTP ${releaseResponse.status})`,
        reason: 'http-status',
        status: releaseResponse.status,
      });
    }

    return yield* HttpClientResponse.schemaBodyJson(GitHubReleaseByTag)(releaseResponse).pipe(
      Effect.mapError(
        cause =>
          new CliReleaseResolutionError({
            cause,
            message: `Failed to decode release ${tag}`,
            reason: 'decode',
          })
      )
    );
  });

export const fetchLatestCliRelease = ({
  assetDescription,
  channel,
  githubConfig,
  hasRequiredAsset,
  httpClient,
}: {
  assetDescription: string;
  channel: CliReleaseChannel;
  githubConfig: GitHubRepoConfig;
  hasRequiredAsset: (release: GitHubRelease) => boolean;
  httpClient: HttpClient.HttpClient;
}) =>
  Effect.gen(function* () {
    const releaseUrl = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases?per_page=100`;
    const releaseResponse = yield* httpClient.get(releaseUrl).pipe(
      Effect.mapError(
        cause =>
          new CliReleaseResolutionError({
            cause,
            message: `Failed to fetch ${channel} releases from GitHub`,
            reason: 'request',
          })
      )
    );

    if (releaseResponse.status < 200 || releaseResponse.status >= 300) {
      return yield* Effect.fail(
        new CliReleaseResolutionError({
          message: `Failed to fetch ${channel} releases from GitHub (HTTP ${releaseResponse.status})`,
          reason: 'http-status',
          status: releaseResponse.status,
        })
      );
    }

    const rawReleases = yield* HttpClientResponse.schemaBodyJson(RawGitHubReleases)(
      releaseResponse
    ).pipe(
      Effect.mapError(
        cause =>
          new CliReleaseResolutionError({
            cause,
            message: 'Failed to decode GitHub releases response',
            reason: 'decode',
          })
      )
    );
    const releases = rawReleases.flatMap(entry =>
      Option.match(decodeGitHubRelease(entry), {
        onNone: () => [],
        onSome: release => [release],
      })
    );
    if (releases.length < rawReleases.length) {
      yield* Effect.logDebug(
        `Skipped ${rawReleases.length - releases.length} malformed GitHub release entries.`
      );
    }

    const prerelease = channel === 'beta';
    const matchingReleases = releases.filter(
      release =>
        (release.prerelease === undefined
          ? prerelease === false
          : release.prerelease === prerelease) &&
        release.draft !== true &&
        CLI_RELEASE_TAG_PATTERN.test(release.tag_name) &&
        hasRequiredAsset(release)
    );

    if (matchingReleases.length === 0) {
      return yield* Effect.fail(
        new CliReleaseResolutionError({
          message: `No ${channel} CLI releases found with ${assetDescription}`,
          reason: 'not-found',
        })
      );
    }

    let latest = matchingReleases[0];
    for (const release of matchingReleases.slice(1)) {
      const comparison = yield* semverComparator(latest.tag_name, release.tag_name).pipe(
        Effect.mapError(
          cause =>
            new CliReleaseResolutionError({
              cause,
              message: `Failed to compare release versions: ${latest.tag_name} and ${release.tag_name}`,
              reason: 'compare',
            })
        )
      );

      if (comparison < 0) {
        latest = release;
      }
    }

    return latest;
  });
