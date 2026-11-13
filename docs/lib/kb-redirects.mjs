// Redirects for the retired Knowledge Base (/kb). See docs/decisions/kb-retirement.md.
//
// Each KB guide that received traffic points at the closest maintained page.
// Toolkit guides and toolkit hubs go to the matching /toolkits/<slug> page, which
// carries the toolkit FAQ. Anything else under /kb falls through to /docs.

/** KB guide slug -> closest maintained page. */
export const KB_GUIDE_REDIRECTS = {
  'consumer-project-boundaries-and-auth-selection': '/docs/consumer-agents',
  'dashboard-account-deletion': '/docs/security/data-retention',
  'dashboard-auth-configs-navigation': '/docs/auth-configuration/custom-auth-configs',
  'dashboard-for-you-navigation': '/docs/consumer-agents',
  'dashboard-log-storage': '/docs/security/data-retention',
  'dashboard-login-restrictions': '/docs/security/overview',
  'dashboard-navigation-overview': '/docs/how-composio-works',
  'dashboard-org-members': '/docs/security/overview',
  'dashboard-project-settings-navigation': '/docs/how-composio-works',
  'dashboard-tool-trigger-logs-navigation': '/docs/setting-up-triggers/troubleshooting',
  faqs: '/docs',
  'mcp-mcp-hermes': '/docs/agent-setup/clients',
  'mcp-tool-router-files': '/reference/sdk-reference/typescript/session-files',
  'mcp-tool-router-sessions': '/docs/configuring-sessions',
  'platform-compliance-data-handling': '/docs/security/overview',
  'platform-connected-accounts': '/docs/auth-configuration/connected-accounts',
  'platform-custom-connection-data-fields': '/docs/auth-configuration/custom-auth-params',
  'platform-file-storage': '/reference/sdk-reference/typescript/session-files',
  'platform-google-oauth': '/docs/authentication/custom-app-vs-managed-app',
  'platform-health-endpoints': '/docs/security/overview',
  'platform-microsoft-oauth': '/docs/authentication/controlling-scopes',
  'platform-pagination': '/reference',
  'platform-production-readiness': '/docs/production-readiness',
  'platform-project-api-key-permissions': '/reference/authenticating-to-composio/project-api-key-permissions',
  'platform-rate-limits': '/reference/rate-limits',
  'platform-routing': '/docs',
  'platform-self-hosted-helm': '/docs/security/overview',
  'platform-session-tool-policies': '/docs/session-configs',
  'platform-tool-router-workbench': '/docs/sandbox/remote',
  'platform-triggers': '/docs/triggers',
  'sdk-tool-execution-retries': '/docs/tools-direct/executing-tools',
  'sdk-tool-schemas': '/docs/tools-direct/fetching-tools',
};

/**
 * KB toolkit guides are named `toolkits-<name>`. Most names match the toolkit
 * slug; these did not.
 */
export const KB_TOOLKIT_GUIDE_SLUGS = {
  'browser-tool': 'browser_tool',
  'digital-ocean': 'digital_ocean',
  'google-analytics': 'google_analytics',
  'google-calendar': 'googlecalendar',
  'google-classroom': 'google_classroom',
  'google-maps': 'google_maps',
  'granola-mcp': 'granola_mcp',
  'launch-darkly': 'launch_darkly',
  'microsoft-teams': 'microsoft_teams',
  'one-drive': 'one_drive',
  sharepoint: 'share_point',
  'zoho-books': 'zoho_books',
  'zoho-mail': 'zoho_mail',
};

/** KB topic hub -> closest maintained page. */
export const KB_TOPIC_REDIRECTS = {
  'account-billing-and-security': '/docs/security/overview',
  'authentication-and-connected-accounts': '/docs/authentication',
  'sdk-api-and-mcp': '/reference',
  'tools-actions-and-execution': '/docs/tools-direct/executing-tools',
  'triggers-and-workflows': '/docs/triggers',
};

function withMarkdown(source, destination) {
  return [
    { source, destination, permanent: true },
    { source: `${source}.:format(md|mdx)`, destination: `${destination}.md`, permanent: true },
  ];
}

export function kbRedirects() {
  return [
    ...Object.entries(KB_GUIDE_REDIRECTS).flatMap(([slug, destination]) =>
      withMarkdown(`/kb/guide/${slug}`, destination),
    ),
    ...Object.entries(KB_TOOLKIT_GUIDE_SLUGS).flatMap(([name, slug]) =>
      withMarkdown(`/kb/guide/toolkits-${name}`, `/toolkits/${slug}`),
    ),
    ...withMarkdown('/kb/guide/toolkits-:slug', '/toolkits/:slug'),
    ...Object.entries(KB_TOPIC_REDIRECTS).flatMap(([slug, destination]) =>
      withMarkdown(`/kb/topic/${slug}`, destination),
    ),
    ...withMarkdown('/kb/toolkit/:slug', '/toolkits/:slug'),
    ...withMarkdown('/kb/toolkits', '/toolkits'),
    ...withMarkdown('/kb', '/docs'),
    // Next.js merges the incoming query into the destination; `q=` overwrites
    // saved search text so it never reaches /docs or page analytics.
    { source: '/kb/search', destination: '/docs?q=', permanent: true },
    { source: '/kb/search.:format(md|mdx)', destination: '/docs.md?q=', permanent: true },
    // The /llms.mdx/ form of a KB page forwards to its .md URL, handled above.
    { source: '/llms.mdx/kb', destination: '/docs.md', permanent: true },
    { source: '/llms.mdx/kb/:path*', destination: '/kb/:path*.md', permanent: true },
    { source: '/kb/:path*.:format(md|mdx)', destination: '/docs.md', permanent: true },
    { source: '/kb/:path*', destination: '/docs', permanent: true },
  ];
}
