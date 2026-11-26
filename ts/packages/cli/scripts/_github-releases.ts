/**
 * Read CLI releases from GitHub's release API, for the release scripts that
 * compare against or install a published release.
 */

import { Option, Schema } from 'effect';
import { CLI_RELEASE_TAG_PATTERN, GitHubRelease } from '../src/effects/resolve-cli-release';

const RELEASES_API = 'https://api.github.com/repos/ComposioHQ/composio/releases';
const PAGE_SIZE = 100;

const decodeRelease = Schema.decodeUnknownSync(GitHubRelease);
const decodeReleaseOption = Schema.decodeUnknownOption(GitHubRelease);

/** `GITHUB_TOKEN` raises the API rate limit; public releases need no token. */
const getJson = async (url: string): Promise<unknown> => {
  const token = process.env.GITHUB_TOKEN?.trim();
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
};

export const fetchReleaseByTag = async (tag: string): Promise<GitHubRelease> =>
  decodeRelease(await getJson(`${RELEASES_API}/tags/${encodeURIComponent(tag)}`));

const isStableCliRelease = (release: GitHubRelease): boolean =>
  CLI_RELEASE_TAG_PATTERN.test(release.tag_name) &&
  release.prerelease !== true &&
  release.draft !== true;

/**
 * The newest stable CLI release, or `undefined` if there is none. Betas and other
 * packages' releases share the list, so this reads pages until it finds one. As
 * in `fetchLatestCliRelease`, an entry that does not decode (a draft whose
 * assets are still uploading) is skipped rather than failing the lookup.
 */
export const findLatestStableCliRelease = async (): Promise<GitHubRelease | undefined> => {
  for (let page = 1; ; page += 1) {
    const body = await getJson(`${RELEASES_API}?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(body)) throw new Error(`${RELEASES_API} did not return a list`);
    const stable = body
      .flatMap(entry => Option.toArray(decodeReleaseOption(entry)))
      .find(isStableCliRelease);
    if (stable !== undefined || body.length < PAGE_SIZE) return stable;
  }
};
