import { Config } from 'effect';
import * as constants from 'src/constants';
import { optionalString, withFallback } from './env';

export interface GitHubConfig {
  readonly apiBaseUrl: string;
  readonly owner: string;
  readonly repo: string;
  /** Pins the release to fetch instead of resolving the latest one. */
  readonly tag: string | undefined;
  /** Avoids GitHub API rate limits during development. */
  readonly accessToken: string | undefined;
}

const githubConfig = (
  read: (name: string) => Config.Config<string | undefined>
): Config.Config<GitHubConfig> =>
  Config.all({
    apiBaseUrl: withFallback(read('API_BASE_URL'), constants.GITHUB_REPO.API_BASE_URL),
    owner: withFallback(read('OWNER'), constants.GITHUB_REPO.OWNER),
    repo: withFallback(read('REPO'), constants.GITHUB_REPO.REPO),
    tag: read('TAG'),
    accessToken: read('ACCESS_TOKEN'),
  });

const prefixed = (name: string) => optionalString(`COMPOSIO_GITHUB_${name}`);

// The binary build workflow and CI speak the unprefixed `GITHUB_*` contract, which wins.
const unprefixedFirst = (name: string) =>
  Config.all({ ci: optionalString(`GITHUB_${name}`), prefixed: prefixed(name) }).pipe(
    Config.map(({ ci, prefixed }) => ci ?? prefixed)
  );

/**
 * Where `composio upgrade`, `composio setup skill`, and the update check fetch releases from.
 * The `COMPOSIO_GITHUB_*` overrides are documented in the README.
 */
export const GITHUB_CONFIG = githubConfig(prefixed);

/** The same settings for self-repair of a packaged install, honoring the workflow's `GITHUB_*`. */
export const GITHUB_REPAIR_CONFIG = githubConfig(unprefixedFirst);
