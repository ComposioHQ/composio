'use client';

import { useApiVersion } from '@/lib/use-api-version';
import { LegacyBadge } from '@/components/legacy-badge';

interface Endpoint {
  method: string;
  pathV31: string;
  pathV3: string;
  summary: string;
  href: string;
  /** Set by the generator for operations flagged `deprecated` in the OpenAPI
   *  spec. Surfaced with the existing "Legacy" tag (see components/legacy-badge.tsx). */
  legacy?: boolean;
}

/**
 * Renders an endpoint table that updates based on the selected API version.
 * Used in auto-generated index pages.
 */
export function ApiEndpointsTable({ endpoints }: { endpoints: Endpoint[] }) {
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
                <a href={ep.href}>{ep.summary}</a>
                {ep.legacy && (
                  <span className="ml-2 inline-flex align-middle">
                    <LegacyBadge
                      title="Deprecated API endpoint; kept for existing integrations and may be removed in a future release"
                    />
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
