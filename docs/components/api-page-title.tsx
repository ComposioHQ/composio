import { DeprecatedApiLegacyBadge } from '@/components/legacy-badge';
import { VersionBadge } from '@/components/version-badge';
import { getApiDisplayTitle } from '@/lib/api-deprecation';

interface ApiPageTitleProps {
  title: string;
  version: string | null;
  deprecated: boolean;
}

export function ApiPageTitle({
  title,
  version,
  deprecated,
}: ApiPageTitleProps) {
  const displayTitle = getApiDisplayTitle(title, deprecated);

  return (
    <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold">
      <span>{displayTitle}</span>
      {(version || deprecated) && (
        <span className="inline-flex shrink-0 items-center gap-2">
          {version && <VersionBadge version={version} />}
          {deprecated && <DeprecatedApiLegacyBadge />}
        </span>
      )}
    </h1>
  );
}
