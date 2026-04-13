import { Effect } from 'effect';
import { HttpClient } from '@effect/platform';
import { semverComparator } from 'src/effects/compare-semver';
import type { CliReleaseChannel } from 'src/constants';

export type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubRelease = {
  tag_name: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: Array<GitHubReleaseAsset>;
};

export type GitHubRepoConfig = {
  API_BASE_URL: string;
  OWNER: string;
  REPO: string;
};

export const CLI_RELEASE_TAG_PATTERN = /^@composio\/cli@\d+\.\d+\.\d+.*$/;

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
    const releaseResponse = yield* httpClient
      .get(releaseUrl)
      .pipe(
        Effect.catchAll(error =>
          Effect.fail(new Error(`Failed to fetch ${channel} releases from GitHub: ${error}`))
        )
      );

    if (releaseResponse.status < 200 || releaseResponse.status >= 300) {
      return yield* Effect.fail(
        new Error(
          `Failed to fetch ${channel} releases from GitHub (HTTP ${releaseResponse.status})`
        )
      );
    }

    const releases = (yield* releaseResponse.json.pipe(
      Effect.catchAll(() => Effect.fail(new Error('Failed to parse GitHub releases JSON')))
    )) as unknown;

    if (!Array.isArray(releases)) {
      return yield* Effect.fail(new Error('GitHub releases response was not an array'));
    }

    const prerelease = channel === 'beta';
    const matchingReleases = releases.filter(
      (release): release is GitHubRelease =>
        typeof release === 'object' &&
        release !== null &&
        'tag_name' in release &&
        typeof release.tag_name === 'string' &&
        ('prerelease' in release ? release.prerelease === prerelease : prerelease === false) &&
        ('draft' in release ? release.draft === false : true) &&
        CLI_RELEASE_TAG_PATTERN.test(release.tag_name) &&
        Array.isArray(release.assets) &&
        hasRequiredAsset(release)
    );

    if (matchingReleases.length === 0) {
      return yield* Effect.fail(
        new Error(`No ${channel} CLI releases found with ${assetDescription}`)
      );
    }

    let latest = matchingReleases[0];
    for (const release of matchingReleases.slice(1)) {
      const comparison = yield* semverComparator(latest.tag_name, release.tag_name).pipe(
        Effect.mapError(error => new Error(`Failed to compare release versions: ${error}`))
      );

      if (comparison < 0) {
        latest = release;
      }
    }

    return latest;
  });
