import logger from './logger';
import { IS_DEVELOPMENT_OR_CI } from './constants';
import semver from 'semver';

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/ComposioHQ/composio/releases?per_page=100';
const CORE_RELEASE_TAG_RE = /^@composio\/core@(\d+\.\d+\.\d+)$/;

type GitHubRelease = {
  tag_name?: unknown;
  prerelease?: unknown;
  draft?: unknown;
};

/**
 * Compares two semantic versions and returns true if the first version is newer than the second.
 * @param version1 The first version to compare
 * @param version2 The second version to compare
 * @returns boolean indicating if version1 is newer than version2
 */
export function isNewerVersion(version1: string, version2: string): boolean {
  const v1 = version1.split('.').map(Number);
  const v2 = version2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (v1[i] > v2[i]) return true;
    if (v1[i] < v2[i]) return false;
  }
  return false;
}

/**
 * Extracts the latest stable @composio/core release version from a GitHub releases response.
 */
export function parseLatestVersionFromGitHubReleases(releases: unknown): string | undefined {
  if (!Array.isArray(releases)) {
    return undefined;
  }

  let latestVersion: string | undefined;

  for (const release of releases) {
    if (typeof release !== 'object' || release === null) {
      continue;
    }

    const { tag_name, prerelease, draft } = release as GitHubRelease;
    if (prerelease === true || draft === true || typeof tag_name !== 'string') {
      continue;
    }

    const match = CORE_RELEASE_TAG_RE.exec(tag_name);
    if (!match) {
      continue;
    }

    const [, version] = match;
    if (!latestVersion || semver.gt(version, latestVersion)) {
      latestVersion = version;
    }
  }

  return latestVersion;
}

/**
 * Checks for the latest version of the Composio SDK from GitHub releases.
 * If a newer version is available, it logs a warning to the console.
 */
export async function checkForLatestVersionFromGitHub(currentVersion: string) {
  try {
    const currentVersionFromPackageJson = currentVersion;

    // ignore if the current version is not a valid semantic version
    if (!semver.valid(currentVersionFromPackageJson)) {
      return;
    }

    // ignore if the current version is alpha or beta
    const prerelease = semver.prerelease(currentVersionFromPackageJson);
    if (
      prerelease &&
      (String(prerelease[0]).includes('alpha') || String(prerelease[0]).includes('beta'))
    ) {
      return;
    }

    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `composio-core/${currentVersionFromPackageJson}`,
      },
    });

    if (!response.ok) {
      return;
    }

    const releases = await response.json();
    const latestVersion = parseLatestVersionFromGitHubReleases(releases);

    if (!latestVersion) {
      return;
    }

    if (semver.gt(latestVersion, currentVersionFromPackageJson) && !IS_DEVELOPMENT_OR_CI) {
      logger.info(
        `🚀 Upgrade available! Your composio-core version (${currentVersionFromPackageJson}) is behind. Latest version: ${latestVersion}.`
      );
    }
  } catch (_error) {
    // Ignore and do nothing
  }
}
