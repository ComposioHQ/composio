'use client';

import { useApiVersion } from '@/lib/use-api-version';

interface Endpoint {
  method: string;
  pathV31: string;
  pathV3: string;
  summary: string;
  href: string;
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
              <td><a href={ep.href}>{ep.summary}</a></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
