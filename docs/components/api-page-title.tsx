import { DeprecatedApiLegacyBadge } from '@/components/legacy-badge';
import { VersionBadge } from '@/components/version-badge';

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
  return (
    <h1 className="text-2xl font-semibold">
      {title}
      {version && (
        <span className="ml-2 align-middle">
          <VersionBadge version={version} />
        </span>
      )}
      {deprecated && (
        <span className="ml-2 inline-flex align-middle">
          <DeprecatedApiLegacyBadge />
        </span>
      )}
    </h1>
  );
}
