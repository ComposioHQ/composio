/** The version history `toolkits version` prints. */
export type ToolkitVersions = {
  readonly slug: string;
  readonly name: string;
  readonly latestVersion: string | null;
  readonly recentVersions: ReadonlyArray<string>;
};

// --- stderr -----------------------------------------------------------------------------------

export const formatToolkitVersions = (versions: ToolkitVersions): string =>
  [
    `Toolkit: ${versions.name} (${versions.slug})`,
    `Latest Version: ${versions.latestVersion ?? 'none'}`,
    `Last ${versions.recentVersions.length} Available Versions:`,
    versions.recentVersions.length > 0
      ? versions.recentVersions.map(version => `- ${version}`).join('\n')
      : '- none',
  ].join('\n');

// --- stdout -----------------------------------------------------------------------------------

export const formatToolkitVersionsJson = (versions: ToolkitVersions): string =>
  JSON.stringify(
    {
      slug: versions.slug,
      latest_version: versions.latestVersion,
      available_versions_last_20: versions.recentVersions,
    },
    null,
    2
  );
