/**
 * Single source of truth for the Composio production API URL used by the docs
 * generators (fetch-openapi.mjs, generate-toolkits.ts, generate-meta-tools.ts).
 *
 * The "Docs - Update Data" workflow (.github/workflows/docs-update-data.yml)
 * fetches the OpenAPI specs and toolkit data from STAGING. Without a guard,
 * staging hosts leak into the committed, published docs artifacts — e.g. the
 * OpenAPI `servers[0].url` (curl base URL) and toolkit auth-config `default`
 * URLs. The generators pin/rewrite these to production before writing;
 * tests/static/production-urls.test.ts is the independent CI guard.
 *
 * The guard test deliberately does NOT import from this module: an oracle must
 * verify against an independently-stated expectation, so a wrong edit here fails
 * the test instead of silently moving both sides together.
 */

export const PRODUCTION_HOST = 'backend.composio.dev';
export const PRODUCTION_BASE_URL = `https://${PRODUCTION_HOST}`;
export const PRODUCTION_API_V3_URL = `${PRODUCTION_BASE_URL}/api/v3`;
export const PRODUCTION_API_V31_URL = `${PRODUCTION_BASE_URL}/api/v3.1`;

/** Non-production hosts that must never appear in published docs data. */
export const STAGING_HOSTS = ['staging-backend.composio.dev', 'staging-apollo.composio.dev'];

/**
 * Rewrite any staging host in a serialized JSON string to the production host,
 * so a spec/data payload fetched from staging publishes production URLs.
 * Operates on the serialized string to avoid disturbing typed data pipelines.
 */
export function stripStagingHosts(text) {
  let out = text;
  for (const host of STAGING_HOSTS) {
    out = out.split(host).join(PRODUCTION_HOST);
  }
  return out;
}
