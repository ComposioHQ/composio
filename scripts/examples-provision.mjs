#!/usr/bin/env node
// Idempotent provisioning check for the live example sweeps.
//
// Verifies that the dedicated (disposable) Composio project holds the auth
// configs and connected accounts the tier-2/3 examples need, creates whatever
// can be created without a human (API-key auth config), and
// prints the remaining one-time OAuth authorizations.
//
//   node scripts/examples-provision.mjs            # report (stderr) + exports (stdout)
//   eval "$(node scripts/examples-provision.mjs)"  # load COMPOSIO_EXAMPLES_* into the shell
//   node scripts/examples-provision.mjs --initiate-missing
//        also starts an OAuth connection request for each missing account and
//        prints the redirect URL to authorize it (one browser visit per toolkit)
//   node scripts/examples-provision.mjs --gc
//        also deletes resources example runs leak into the disposable project:
//        connected accounts that never became ACTIVE, surplus serpapi demo
//        accounts, and sweep-created MCP configs (timestamp-suffixed names).
//        Only touches resources older than 24h so a concurrent sweep is safe.
//
// Auth config ids and connected account ids are not secrets; no credential
// values are ever printed. The API-key demo value stored for serpapi is a
// deliberately fake placeholder, not a real key.

const BASE_URL = process.env.COMPOSIO_BASE_URL ?? 'https://backend.composio.dev';
const API_KEY = process.env.COMPOSIO_API_KEY;
const USER_ID = process.env.COMPOSIO_EXAMPLES_USER_ID ?? 'examples';
const INITIATE_MISSING = process.argv.includes('--initiate-missing');
const GC = process.argv.includes('--gc');

// The example sweeps only ever run against the production backend with the
// disposable project key; refuse anything that looks local, like the runner does.
if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(BASE_URL)) {
  console.error(`refusing local COMPOSIO_BASE_URL: ${BASE_URL}`);
  process.exit(1);
}
if (!API_KEY) {
  console.error('COMPOSIO_API_KEY is required (dedicated examples-project key)');
  process.exit(1);
}

// Toolkits the tier-2/3 entries depend on. OAuth toolkits need a one-time human
// browser authorization. Only export ids that examples consume directly.
const BROWSER_GRANT_TOOLKITS = [
  { exportPrefix: 'GMAIL', slug: 'gmail' },
  // googledrive exports nothing: examples reach Drive through the user's
  // standing connection (COMPOSIO_EXAMPLES_USER_ID), never through ids.
  { slug: 'googledrive' },
  { exportPrefix: 'GITHUB', slug: 'github' },
  { exportPrefix: 'SLACK', slug: 'slack' },
];
const DEMO_TOOLKIT = { exportPrefix: 'APIKEY', slug: 'serpapi', demoValue: 'examples-demo-key' };

const report = (line) => console.error(line);

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
}

async function listAll(path, key = 'items') {
  const out = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await api('GET', `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    out.push(...(data?.[key] ?? []));
    cursor = data?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

const [authConfigs, accounts] = await Promise.all([
  listAll('/api/v3.1/auth_configs'),
  listAll(`/api/v3.1/connected_accounts?user_ids=${encodeURIComponent(USER_ID)}`),
]);

if (GC) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stale = (r) => new Date(r.created_at ?? 0).getTime() < cutoff;
  const gcDelete = async (kind, path, item) => {
    await api('DELETE', path);
    report(`gc: deleted ${kind} ${item.id} (${item.toolkit?.slug ?? item.name}, created ${item.created_at})`);
  };

  // Accounts that never became ACTIVE are dead weight from OAuth-initiating
  // example runs; surplus serpapi demo accounts pile up from api-key runs.
  // Standing ACTIVE accounts for the OAuth toolkits are never touched.
  const allAccounts = await listAll('/api/v3.1/connected_accounts');
  const serpapiActive = allAccounts
    .filter((a) => a.toolkit?.slug === 'serpapi' && a.status === 'ACTIVE')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const doomedAccounts = [
    ...allAccounts.filter((a) => a.status !== 'ACTIVE' && stale(a)),
    ...serpapiActive.slice(1).filter(stale),
  ];
  for (const account of doomedAccounts) {
    await gcDelete('connected account', `/api/v3.1/connected_accounts/${account.id}`, account);
  }

  // Sweep-created MCP configs carry a timestamp (suffix or full name).
  const mcpServers = await listAll('/api/v3.1/mcp/servers');
  for (const server of mcpServers.filter((s) => /(?:^|-)\d{10,}$/.test(s.name ?? '') && stale(s))) {
    await gcDelete('mcp config', `/api/v3.1/mcp/${server.id}`, server);
  }
}

const exports = { COMPOSIO_EXAMPLES_USER_ID: USER_ID };
const pendingGrants = [];
let ok = true;

function findAuthConfig(slug) {
  // Prefer the config this script names on creation so a project holding
  // unrelated configs for the same toolkit stays deterministic.
  const candidates = authConfigs.filter((c) => c.toolkit?.slug === slug && c.status !== 'DISABLED');
  return candidates.find((c) => c.name === `examples-${slug}`) ?? candidates[0];
}
function findActiveAccount(slug) {
  return accounts.find((a) => a.toolkit?.slug === slug && a.status === 'ACTIVE');
}

for (const { exportPrefix, slug } of BROWSER_GRANT_TOOLKITS) {
  let config = findAuthConfig(slug);
  if (!config) {
    const created = await api('POST', '/api/v3.1/auth_configs', {
      toolkit: { slug },
      auth_config: { type: 'use_composio_managed_auth', name: `examples-${slug}` },
    });
    config = { id: created.auth_config?.id ?? created.id };
    report(`created auth config for ${slug}: ${config.id}`);
  }
  if (exportPrefix) {
    exports[`COMPOSIO_EXAMPLES_${exportPrefix}_AUTH_CONFIG_ID`] = config.id;
  }

  const account = findActiveAccount(slug);
  if (account) {
    if (exportPrefix) {
      exports[`COMPOSIO_EXAMPLES_${exportPrefix}_CONNECTED_ACCOUNT_ID`] = account.id;
    }
    report(`${slug}: ACTIVE connection ${account.id} (user ${USER_ID})`);
  } else {
    ok = false;
    if (INITIATE_MISSING) {
      const created = await api('POST', '/api/v3.1/connected_accounts', {
        auth_config: { id: config.id },
        connection: { user_id: USER_ID },
      });
      pendingGrants.push(`${slug}: authorize in a browser -> ${created.connectionData?.val?.redirectUrl ?? created.redirect_url ?? created.redirect_uri ?? '(no redirect url returned)'}`);
    } else {
      pendingGrants.push(`${slug}: no ACTIVE connection for user ${USER_ID} — rerun with --initiate-missing to get an authorization URL`);
    }
  }
}

// API-key toolkit: create the auth config automatically. The examples create
// their own connected accounts to demonstrate that API. The stored value is a
// placeholder; serpapi only validates it at tool-execution time and no example
// executes a serpapi tool.
{
  const { exportPrefix, slug, demoValue } = DEMO_TOOLKIT;
  let config = findAuthConfig(slug);
  if (!config) {
    const created = await api('POST', '/api/v3.1/auth_configs', {
      toolkit: { slug },
      auth_config: { type: 'use_custom_auth', authScheme: 'API_KEY', name: `examples-${slug}` },
    });
    config = { id: created.auth_config?.id ?? created.id };
    report(`created API-key auth config for ${slug}: ${config.id}`);
  }
  exports[`COMPOSIO_EXAMPLES_${exportPrefix}_AUTH_CONFIG_ID`] = config.id;
  exports[`COMPOSIO_EXAMPLES_${exportPrefix}_PLACEHOLDER`] = demoValue;
}

if (pendingGrants.length) {
  report('');
  report('OAuth connections still needing a one-time human authorization:');
  for (const line of pendingGrants) report(`  - ${line}`);
}
report('');
report(ok ? 'provisioned state: complete' : 'provisioned state: INCOMPLETE (see above)');

for (const [name, value] of Object.entries(exports)) {
  console.log(`export ${name}=${value}`);
}

process.exitCode = ok ? 0 : 1;
