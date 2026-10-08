export const CLI_RELEASE_TAG_PREFIX = '@composio/cli@';
export const CLI_RELEASE_VERSION_DEFINE = '__COMPOSIO_CLI_RELEASE_VERSION__';

const CLI_RELEASE_TAG_PATTERN =
  /^@composio\/cli@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u;

export const extractCliReleaseVersion = (releaseTag: string): string | undefined =>
  CLI_RELEASE_TAG_PATTERN.exec(releaseTag.trim())?.[1];

export const buildCliReleaseVersionDefineArgs = (
  releaseTag: string | undefined
): ReadonlyArray<string> => {
  if (!releaseTag?.trim()) return [];

  const releaseVersion = extractCliReleaseVersion(releaseTag);
  if (!releaseVersion) {
    throw new Error(`Invalid Composio CLI release tag: ${releaseTag}`);
  }

  return ['--define', `${CLI_RELEASE_VERSION_DEFINE}=${JSON.stringify(releaseVersion)}`] as const;
};
