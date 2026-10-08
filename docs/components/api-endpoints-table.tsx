'use client';

import { useApiVersion } from '@/lib/use-api-version';
import { DeprecatedApiLegacyBadge } from '@/components/legacy-badge';
import { getApiDisplayTitle } from '@/lib/api-deprecation';
import type { ApiEndpoint } from '@/lib/api-endpoints-table-schema';

/**
 * Renders an endpoint table that updates based on the selected API version.
 * Used in auto-generated index pages.
 *
 * The prop shape lives in `lib/api-endpoints-table-schema.ts` — one type, one
 * source, shared with the `.md` converter and the generator's validation.
 */
export function ApiEndpointsTable({ endpoints }: { endpoints: ApiEndpoint[] }) {
  const version = useApiVersion();

  return (
    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Quick Link</th>
        </tr>
      </thead>
      <tbody>
        {endpoints.map((ep, i) => {
          const path = version === '3.0' ? ep.pathV3 : ep.pathV31;
          return (
            <tr key={i}>
              <td><code>{ep.method} {path}</code></td>
              <td>
                <a href={ep.href}>
                  {getApiDisplayTitle(ep.summary, ep.legacy === true)}
                </a>
                {ep.legacy && (
                  <span className="ml-2 inline-flex align-middle">
                    <DeprecatedApiLegacyBadge />
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
