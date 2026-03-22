import logger from './logger';
import { IS_DEVELOPMENT_OR_CI, COMPOSIO_DIR } from './constants';
import semver from 'semver';
import { platform } from '#platform';

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

const VERSION_CACHE_FILENAME = 'version-cache.json';
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const VERSION_FETCH_TIMEOUT_MS = 5000;

interface VersionCache {
  version: string;
  timestamp: number;
}

function getVersionCachePath(): string | null {
  const homeDir = platform.homedir();
  if (!homeDir) return null;
  return platform.joinPath(homeDir, COMPOSIO_DIR, VERSION_CACHE_FILENAME);
}

function readVersionCache(): VersionCache | null {
  if (!platform.supportsFileSystem) return null;
  try {
    const cachePath = getVersionCachePath();
    if (!cachePath) return null;
    const raw = platform.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(raw) as VersionCache;
    if (cache && typeof cache.version === 'string' && typeof cache.timestamp === 'number') {
      return cache;
    }
  } catch {
    // Cache doesn't exist or is malformed
  }
  return null;
}

function writeVersionCache(version: string): void {
  if (!platform.supportsFileSystem) return;
  try {
    const cachePath = getVersionCachePath();
    if (!cachePath) return;
    const homeDir = platform.homedir();
    if (homeDir) {
      const composioDir = platform.joinPath(homeDir, COMPOSIO_DIR);
      if (!platform.existsSync(composioDir)) {
        platform.mkdirSync(composioDir);
      }
    }
    platform.writeFileSync(cachePath, JSON.stringify({ version, timestamp: Date.now() }), 'utf8');
  } catch {
    // Ignore write errors (e.g., permission issues)
  }
}

/**
 * Checks for the latest version of the Composio SDK from NPM.
 * If a newer version is available, it logs a warning to the console.
 * Uses a file-based cache to avoid hitting the npm registry on every init.
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

    // Check file-based cache first
    const cache = readVersionCache();
    if (cache && Date.now() - cache.timestamp < VERSION_CACHE_TTL_MS) {
      if (semver.gt(cache.version, currentVersionFromPackageJson) && !IS_DEVELOPMENT_OR_CI) {
        logger.info(
          `🚀 Upgrade available! Your composio-core version (${currentVersionFromPackageJson}) is behind. Latest version: ${cache.version}.`
        );
      }
      return;
    }

    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(VERSION_FETCH_TIMEOUT_MS),
    });
    const data = await response.json();
    const latestVersion = data.version;

    if (typeof latestVersion === 'string' && semver.valid(latestVersion)) {
      writeVersionCache(latestVersion);
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
