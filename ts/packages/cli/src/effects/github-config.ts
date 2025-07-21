import { Config, Option } from 'effect';

type GITHUB_CONFIG = Config.Config.Wrap<{
  API_BASE_URL: string;
  OWNER: string;
  REPO: string;
  TAG: Option.Option<string>;
  ACCESS_TOKEN: Option.Option<string>;
}>;

/**
 * Describe every Github configuration key used at runtime.
 */
export const GITHUB_CONFIG = {
  // The base URL for the GitHub API
  API_BASE_URL: Config.string('GITHUB_API_BASE_URL').pipe(
    Config.withDefault('https://api.github.com')
  ),

  // The owner of the Composio repository on GitHub
  OWNER: Config.string('GITHUB_OWNER').pipe(Config.withDefault('ComposioHQ')),

  // The repository name for the Composio CLI
  REPO: Config.string('GITHUB_REPO').pipe(Config.withDefault('composio')),

  // The tag to use as the latest release
  TAG: Config.option(Config.string('GITHUB_TAG')),

  // The access token for the GitHub API. Only useful during development to avoid getting rate-limited by Github
  ACCESS_TOKEN: Config.option(Config.string('GITHUB_ACCESS_TOKEN')),
} satisfies GITHUB_CONFIG;
