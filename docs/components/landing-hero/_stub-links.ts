/** Subset of the landing-page link table the hero needs. Kept in this
 *  shape so the ported `hero-section.tsx` keeps reading `URLS.DASHBOARD`
 *  and `URLS.DOCS` without code changes. */
export const URLS = {
  DASHBOARD: "https://dashboard.composio.dev",
  DOCS: "/docs/quickstart",
} as const;
