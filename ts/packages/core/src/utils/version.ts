import logger from './logger';
import { IS_DEVELOPMENT_OR_CI } from './constants';
import semver from 'semver';

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

const VERSION_CHECK_TIMEOUT_MS = 2_000;

/**
 * Checks for the latest version of the Composio SDK from NPM.
 * If a newer version is available, it logs a warning to the console.
 *
 * Best-effort: never throws. The npm registry request is aborted after
 * {@link VERSION_CHECK_TIMEOUT_MS} milliseconds.
 */
export async function checkForLatestVersionFromNPM(currentVersion: string) {
  try {
    const packageName = '@composio/core';
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

    // Bound this best-effort request so a stalled registry cannot leave it pending indefinitely.
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS),
    });
    const data = await response.json();
    const latestVersion = data.version;

    if (semver.gt(latestVersion, currentVersionFromPackageJson) && !IS_DEVELOPMENT_OR_CI) {
      logger.info(
        `🚀 Upgrade available! Your ${packageName} version (${currentVersionFromPackageJson}) is behind. Latest version: ${latestVersion}.`
      );
    }
  } catch (_error) {
    // Ignore and do nothing
  }
}
