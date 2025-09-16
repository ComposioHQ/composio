import { ToolkitVersion, ToolkitVersionParam } from '../types/tool.types';

/**
 * Gets the version for a specific toolkit based on the provided toolkit versions configuration.
 *
 * @param toolkitSlug - The slug/name of the toolkit to get the version for
 * @param toolkitVersions - Optional toolkit versions configuration (string for global version or object mapping toolkit slugs to versions)
 * @returns The toolkit version to use - either the specific version from config, or 'latest' as fallback
 */
export const getToolkitVersion = (
  toolkitSlug: string,
  toolkitVersions?: ToolkitVersionParam
): ToolkitVersion => {
  // If toolkitVersions is a string, use it as a global version for all toolkits
  if (typeof toolkitVersions === 'string') {
    return toolkitVersions;
  }
  // If toolkitVersions is an object mapping, look up the specific toolkit version
  const hasToolkitVersion = toolkitVersions && Object.keys(toolkitVersions).length > 0;
  if (hasToolkitVersion) {
    return toolkitVersions[toolkitSlug] ?? 'latest';
  }

  // Else use 'latest'
  return 'latest';
};
