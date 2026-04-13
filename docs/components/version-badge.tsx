/**
 * Badge component for displaying API version (v3.0, v3.1, etc.)
 */
export function VersionBadge({ version }: { version: string }) {
  const isLatest = version === '3.1';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        isLatest
          ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20'
          : 'bg-fd-muted text-fd-muted-foreground ring-fd-border'
      }`}
    >
      v{version}
    </span>
  );
}

/**
 * Extract API version from an endpoint path like /api/v3.1/tools/...
 * Returns normalized version string (e.g., "3.0", "3.1")
 */
export function extractVersionFromPath(path: string): string | null {
  const match = path.match(/\/api\/v([\d.]+)\//);
  if (!match) return null;
  return match[1] === '3' ? '3.0' : match[1];
}
