'use client';

import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();
  const version = (pathname.startsWith('/reference/v3/') || pathname === '/reference/v3') ? '3.0' : '3.1';

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
