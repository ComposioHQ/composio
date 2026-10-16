import { describe, expect, it } from 'vitest';
import { dashboardConnectUrl } from 'src/commands/connected-accounts/link/connected-accounts.link.format';

// The dashboard URL is built from user-controlled segments (the org name comes from the
// session info, the toolkit slug from argv), so the path segments must stay encoded.
describe('connected-accounts link format: dashboardConnectUrl', () => {
  it('encodes spaces in the org name and a plain toolkit slug', () => {
    expect(dashboardConnectUrl('https://app.composio.dev', 'Acme Inc', 'gmail')).toBe(
      'https://app.composio.dev/Acme%20Inc/~/connect/apps/gmail?open=true'
    );
  });

  it('encodes `@` and strips the web URL’s trailing slash', () => {
    expect(dashboardConnectUrl('https://app.composio.dev/', 'ops@example.com', 'notion')).toBe(
      'https://app.composio.dev/ops%40example.com/~/connect/apps/notion?open=true'
    );
  });

  it('keeps a subpath base URL and an already-plain org placeholder', () => {
    expect(dashboardConnectUrl('https://app.composio.dev/eu', '~', 'linear')).toBe(
      'https://app.composio.dev/eu/~/~/connect/apps/linear?open=true'
    );
  });
});
