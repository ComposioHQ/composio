/**
 * Read CLI releases from GitHub's release API, for the release scripts that
 * compare against or install a published release.
 *
 * The repository comes from the CLI's own GitHub settings (`GITHUB_CONFIG`),
 * so the scripts and `composio upgrade` read the same place and honor the same
 * `COMPOSIO_GITHUB_*` overrides.
 */

import { Config, Effect, Option, Schema, Stream } from 'effect';
import { CliError } from 'effect/cli';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { optionalString } from '../src/config/env';
import { GITHUB_CONFIG } from '../src/config/github';
import { GITHUB_REPO } from '../src/constants';
import { CLI_RELEASE_TAG_PATTERN, GitHubRelease } from '../src/effects/resolve-cli-release';

const PAGE_SIZE = 100;

/** GitHub refused a release request, or answered in a shape the CLI cannot read. */
export class GitHubReleasesError extends Schema.TaggedError<GitHubReleasesError>()(
  'scripts/GitHubReleasesError',
  { message: Schema.String }
) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

/**
 * Where releases are read from. A token raises the rate limit; public releases
 * need none. `COMPOSIO_GITHUB_ACCESS_TOKEN` belongs to the configured API host.
 * `GITHUB_TOKEN`, which CI sets, is a github.com token, so it is sent only to
 * the default API host, never to a `COMPOSIO_GITHUB_API_BASE_URL` override.
 */
export const ReleaseSourceConfig = Config.all({
  github: GITHUB_CONFIG,
  ciToken: optionalString('GITHUB_TOKEN'),
}).pipe(
  Config.map(({ github, ciToken }) => ({
    ...github,
    releasesUrl: `${github.apiBaseUrl}/repos/${github.owner}/${github.repo}/releases`,
    token:
      github.accessToken ?? (github.apiBaseUrl === GITHUB_REPO.API_BASE_URL ? ciToken : undefined),
  }))
);

const getJson = <S extends Schema.Top>(path: string, schema: S) =>
  Effect.gen(function* () {
    const source = yield* ReleaseSourceConfig;
    const url = `${source.releasesUrl}${path}`;
    const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeader('accept', 'application/vnd.github+json'),
      source.token === undefined ? request => request : HttpClientRequest.bearerToken(source.token)
    );
    return yield* client
      .execute(request)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)));
  }).pipe(
    Effect.mapError(
      cause =>
        new GitHubReleasesError({ message: `Could not read GitHub releases: ${cause.message}` })
    )
  );

export const fetchReleaseByTag = (tag: string) =>
  getJson(`/tags/${encodeURIComponent(tag)}`, GitHubRelease);

const isStableCliRelease = (release: GitHubRelease): boolean =>
  CLI_RELEASE_TAG_PATTERN.test(release.tag_name) &&
  release.prerelease !== true &&
  release.draft !== true;

/**
 * The newest stable CLI release, if there is one. Betas and other packages'
 * releases share the list, so this reads pages until it finds one. As in
 * `fetchLatestCliRelease`, an entry that does not decode (a draft whose assets
 * are still uploading) is skipped rather than failing the lookup.
 */
export const findLatestStableCliRelease = Stream.paginate(1, (page: number) =>
  getJson(`?per_page=${PAGE_SIZE}&page=${page}`, Schema.Array(Schema.Unknown)).pipe(
    Effect.map(
      entries =>
        [
          entries.flatMap(entry =>
            Option.toArray(Schema.decodeUnknownOption(GitHubRelease)(entry))
          ),
          entries.length < PAGE_SIZE ? Option.none() : Option.some(page + 1),
        ] as const
    )
  )
).pipe(Stream.filter(isStableCliRelease), Stream.runHead);
