/**
 * Single source of truth for the Composio production API URL used by the docs
 * generators (fetch-openapi.mjs, generate-toolkits.ts, generate-meta-tools.ts).
 *
 * Published docs data must come from production. The "Docs - Update Data"
 * workflow leaves the base URL unset, and the toolkit/meta-tool generators
 * reject non-production overrides before making a request. Host rewriting is
 * retained as defense in depth for staging URLs embedded inside an otherwise
 * production-sourced payload.
 *
 * The guard test deliberately does NOT import from this module: an oracle must
 * verify against an independently-stated expectation, so a wrong edit here fails
 * the test instead of silently moving both sides together.
 */

export const PRODUCTION_HOST = 'backend.composio.dev';
export const PRODUCTION_BASE_URL = `https://${PRODUCTION_HOST}`;
export const PRODUCTION_API_V3_URL = `${PRODUCTION_BASE_URL}/api/v3`;
export const PRODUCTION_API_V31_URL = `${PRODUCTION_BASE_URL}/api/v3.1`;

/**
 * Resolve the API base used to generate publishable docs data.
 *
 * An override is accepted only when it normalizes to the production v3 URL.
 * Failing loudly prevents a local or CI environment variable from silently
 * turning the checked-in catalog into a staging snapshot.
 */
export function requireProductionApiV3Url(configuredUrl) {
  const normalized = configuredUrl?.trim().replace(/\/+$/, '') || PRODUCTION_API_V3_URL;

  if (normalized !== PRODUCTION_API_V3_URL) {
    throw new Error(
      `Published docs data must be generated from ${PRODUCTION_API_V3_URL}; received ${normalized}`
    );
  }

  return PRODUCTION_API_V3_URL;
}

/** Non-production hosts that must never appear in published docs data. */
export const STAGING_HOSTS = ['staging-backend.composio.dev', 'staging-apollo.composio.dev'];

/**
 * Rewrite any staging host embedded in a serialized JSON string to the
 * production host.
 * Operates on the serialized string to avoid disturbing typed data pipelines.
 */
export function stripStagingHosts(text) {
  let out = text;
  for (const host of STAGING_HOSTS) {
    out = out.split(host).join(PRODUCTION_HOST);
  }
  return out;
}
