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

/** Upper bound on the npm registry version check. Kept short: it is best-effort and unawaited. */
const VERSION_CHECK_TIMEOUT_MS = 2000;

/**
 * Checks for the latest version of the Composio SDK from NPM.
 * If a newer version is available, it logs a warning to the console.
 *
 * Best-effort: never throws, and never keeps the process alive for more than
 * {@link VERSION_CHECK_TIMEOUT_MS}.
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

    // Bounded and abortable: this check is a non-essential background nicety that
    // nobody awaits, so it must never extend process lifetime. An in-flight fetch
    // keeps its socket referenced on the event loop, so without a signal a slow or
    // black-holed registry (corporate proxy, egress firewall that drops rather than
    // rejects, npm incident) keeps short-lived scripts alive until undici's own
    // timeouts fire. The catch below already swallows the resulting TimeoutError.
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
