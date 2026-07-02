#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const failures = [];
const allowed = [];

const fail = message => failures.push(message);
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));

const normalizeName = name =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/_+/g, '_');

const normalizeSet = values => new Set([...values].map(normalizeName));
const sorted = values => [...values].sort();

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripNonCode = source => {
  let output = '';
  let state = 'code';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'lineComment') {
      if (char === '\n') {
        state = 'code';
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }

    if (state === 'blockComment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      const quote = state === 'singleQuote' ? "'" : state === 'doubleQuote' ? '"' : '`';
      if (char === '\\') {
        output += ' ';
        if (next) {
          output += next === '\n' ? '\n' : ' ';
          index += 1;
        }
      } else if (char === quote) {
        output += ' ';
        state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'lineComment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'blockComment';
    } else if (char === "'") {
      output += ' ';
      state = 'singleQuote';
    } else if (char === '"') {
      output += ' ';
      state = 'doubleQuote';
    } else if (char === '`') {
      output += ' ';
      state = 'template';
    } else {
      output += char;
    }
  }

  return output;
};

const findTypeScriptClassBody = (relativePath, className) => {
  const source = stripNonCode(read(relativePath));
  const classPattern = new RegExp(
    `(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapeRegExp(className)}\\b[^{}]*\\{`,
    'm'
  );
  const classMatch = source.match(classPattern);
  if (!classMatch || classMatch.index === undefined) {
    fail(`${relativePath}: could not find TypeScript class ${className}`);
    return '';
  }

  let depth = 1;
  const start = classMatch.index + classMatch[0].length;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index);
      }
    }
  }

  fail(`${relativePath}: could not find end of TypeScript class ${className}`);
  return '';
};

const extractTypeScriptMethods = (relativePath, className) => {
  const body = findTypeScriptClassBody(relativePath, className);
  const methods = new Set();
  const methodPattern =
    /^  (?!(?:private|protected|static)\b)(?:public\s+)?(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\s*(?:<[^;\n({]*>)?\s*\(/gm;

  for (const match of body.matchAll(methodPattern)) {
    if (match[1] !== 'constructor') {
      methods.add(match[1]);
    }
  }

  return normalizeSet(methods);
};

const extractTypeScriptFields = (relativePath, className) => {
  const body = findTypeScriptClassBody(relativePath, className);
  const fields = new Set();
  const fieldPattern =
    /^  (?!(?:private|protected|static)\b)(?:readonly\s+)?([A-Za-z][A-Za-z0-9_]*)[?!]?\s*:/gm;

  for (const match of body.matchAll(fieldPattern)) {
    fields.add(match[1]);
  }

  return normalizeSet(fields);
};

const findPythonClassBody = (relativePath, className) => {
  const lines = read(relativePath).split('\n');
  const classPattern = new RegExp(`^(\\s*)class\\s+${escapeRegExp(className)}\\b`);
  const start = lines.findIndex(line => classPattern.test(line));
  if (start === -1) {
    fail(`${relativePath}: could not find Python class ${className}`);
    return '';
  }

  const baseIndent = lines[start].match(classPattern)[1].length;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)[0].length;
    if (trimmed && !trimmed.startsWith('#') && indent <= baseIndent) {
      break;
    }
    body.push(line);
  }

  return body.join('\n');
};

const extractPythonMethods = (relativePath, className) => {
  const body = findPythonClassBody(relativePath, className);
  const methods = new Set();
  const methodPattern = /^    (?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;

  for (const match of body.matchAll(methodPattern)) {
    if (!match[1].startsWith('_')) {
      methods.add(match[1]);
    }
  }

  return normalizeSet(methods);
};

const extractPythonFields = (relativePath, className) => {
  const body = findPythonClassBody(relativePath, className);
  const fields = new Set();

  for (const match of body.matchAll(/\bself\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) {
    if (!match[1].startsWith('_')) {
      fields.add(match[1]);
    }
  }

  const lines = body.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^    def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!match || match[1].startsWith('_')) {
      continue;
    }

    const decoratorWindow = lines
      .slice(Math.max(0, index - 12), index)
      .map(line => line.trim());
    if (decoratorWindow.includes('@property')) {
      fields.add(match[1]);
    }
  }

  return normalizeSet(fields);
};

const recordAllowed = (scope, side, name, reason) => {
  allowed.push(`${scope}: ${side} ${name} (${reason})`);
};

const checkDiff = ({ scope, typescript, python, allowTypeScriptOnly = {}, allowPythonOnly = {} }) => {
  const typeScriptOnly = sorted([...typescript].filter(name => !python.has(name)));
  const pythonOnly = sorted([...python].filter(name => !typescript.has(name)));

  for (const name of typeScriptOnly) {
    const reason = allowTypeScriptOnly[name];
    if (reason) {
      recordAllowed(scope, 'TypeScript-only', name, reason);
    } else {
      fail(`${scope}: TypeScript exposes "${name}" but Python does not`);
    }
  }

  for (const name of pythonOnly) {
    const reason = allowPythonOnly[name];
    if (reason) {
      recordAllowed(scope, 'Python-only', name, reason);
    } else {
      fail(`${scope}: Python exposes "${name}" but TypeScript does not`);
    }
  }

  const staleTypeScriptAllowances = Object.keys(allowTypeScriptOnly).filter(
    name => !typeScriptOnly.includes(name)
  );
  const stalePythonAllowances = Object.keys(allowPythonOnly).filter(
    name => !pythonOnly.includes(name)
  );

  for (const name of staleTypeScriptAllowances) {
    fail(`${scope}: stale TypeScript-only allowance for "${name}"`);
  }
  for (const name of stalePythonAllowances) {
    fail(`${scope}: stale Python-only allowance for "${name}"`);
  }
};

const checkExactSet = (scope, actual, expected) => {
  const unexpected = sorted([...actual].filter(name => !expected.has(name)));
  const missing = sorted([...expected].filter(name => !actual.has(name)));

  for (const name of unexpected) {
    fail(`${scope}: "${name}" exists on disk but is not declared in the parity matrix`);
  }
  for (const name of missing) {
    fail(`${scope}: "${name}" is declared in the parity matrix but missing on disk`);
  }
};

const checkRootNamespaces = () => {
  const typeScriptFields = extractTypeScriptFields('ts/packages/core/src/composio.ts', 'Composio');
  const pythonFields = extractPythonFields('python/composio/sdk.py', 'Composio');
  const nonNamespaceFields = new Set(['client', 'provider']);
  const tsNamespaces = new Set([...typeScriptFields].filter(name => !nonNamespaceFields.has(name)));
  const pyNamespaces = new Set([...pythonFields].filter(name => !nonNamespaceFields.has(name)));

  checkDiff({
    scope: 'root namespaces',
    typescript: tsNamespaces,
    python: pyNamespaces,
    allowTypeScriptOnly: {
      files:
        'Python currently exposes file upload/download through tool execution helpers, not a root files namespace',
    },
  });
};

// These allowances are the current declared gaps. The validator checks them for
// staleness so closing a gap requires removing its allowance in the same PR.
const resourceSpecs = [
  {
    scope: 'tools methods',
    ts: ['ts/packages/core/src/models/Tools.ts', 'Tools'],
    py: ['python/composio/core/models/tools.py', 'Tools'],
    allowTypeScriptOnly: {
      execute_session_tool: 'session execution helper is surfaced through session.execute in Python',
      get_input: 'TypeScript-only input helper pending the pre-1.0 name audit',
      get_raw_tool_router_session_tools:
        'Python equivalent is get_raw_tool_router_meta_tools pending the pre-1.0 name audit',
      get_tools_enum: 'TypeScript-only enum helper pending the pre-1.0 name audit',
      proxy_execute: 'Python exposes proxy pending rename to proxy_execute',
      wrap_tools_for_provider: 'provider wrapping is an exposed TypeScript implementation helper',
      wrap_tools_for_tool_router: 'session wrapping is an exposed TypeScript implementation helper',
    },
    allowPythonOnly: {
      get_raw_tool_router_meta_tools:
        'Python equivalent of get_raw_tool_router_session_tools pending the pre-1.0 name audit',
      proxy: 'Python equivalent of proxy_execute pending the pre-1.0 name audit',
    },
  },
  {
    scope: 'toolkits methods',
    ts: ['ts/packages/core/src/models/Toolkits.ts', 'Toolkits'],
    py: ['python/composio/core/models/toolkits.py', 'Toolkits'],
    allowPythonOnly: {
      list: 'Python keeps list while TypeScript lists through get pending the pre-1.0 name audit',
    },
  },
  {
    scope: 'triggers methods',
    ts: ['ts/packages/core/src/models/Triggers.ts', 'Triggers'],
    py: ['python/composio/core/models/triggers.py', 'Triggers'],
    allowTypeScriptOnly: {
      delete: 'Python trigger lifecycle parity is a known pre-1.0 gap',
      disable: 'Python trigger lifecycle parity is a known pre-1.0 gap',
      enable: 'Python trigger lifecycle parity is a known pre-1.0 gap',
      list_enum: 'TypeScript-only enum helper pending the pre-1.0 name audit',
      list_types: 'Python equivalent is list pending the pre-1.0 name audit',
      unsubscribe: 'Python subscription helper returns a subscription object instead',
      update: 'Python trigger lifecycle parity is a known pre-1.0 gap',
    },
    allowPythonOnly: {
      list: 'Python equivalent of list_types pending the pre-1.0 name audit',
    },
  },
  {
    scope: 'auth_configs methods',
    ts: ['ts/packages/core/src/models/AuthConfigs.ts', 'AuthConfigs'],
    py: ['python/composio/core/models/auth_configs.py', 'AuthConfigs'],
    allowTypeScriptOnly: {
      update_status: 'Python exposes enable and disable but not the raw update_status helper',
    },
  },
  {
    scope: 'connected_accounts methods',
    ts: ['ts/packages/core/src/models/ConnectedAccounts.ts', 'ConnectedAccounts'],
    py: ['python/composio/core/models/connected_accounts.py', 'ConnectedAccounts'],
    allowTypeScriptOnly: {
      delete: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      disable: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      enable: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      get: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      list: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      refresh: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
      update_status: 'Python connected-account lifecycle parity is a known pre-1.0 gap',
    },
  },
  {
    scope: 'mcp methods',
    ts: ['ts/packages/core/src/models/MCP.ts', 'MCP'],
    py: ['python/composio/core/models/mcp.py', 'MCP'],
  },
  {
    scope: 'sessions methods',
    ts: ['ts/packages/core/src/models/ToolRouter.ts', 'ToolRouter'],
    py: ['python/composio/core/models/tool_router.py', 'ToolRouter'],
  },
  {
    scope: 'session methods',
    ts: ['ts/packages/core/src/models/ToolRouterSession.ts', 'ToolRouterSession'],
    py: ['python/composio/core/models/tool_router_session.py', 'ToolRouterSession'],
  },
  {
    scope: 'session files methods',
    ts: [
      'ts/packages/core/src/models/ToolRouterSessionFileMount.ts',
      'ToolRouterSessionFilesMount',
    ],
    py: [
      'python/composio/core/models/tool_router_session_files.py',
      'ToolRouterSessionFilesMount',
    ],
  },
  {
    scope: 'experimental methods',
    ts: ['ts/packages/core/src/models/Experimental.ts', 'Experimental'],
    py: ['python/composio/core/models/experimental.py', 'ExperimentalAPI'],
    allowPythonOnly: {
      tool: 'Python decorator API maps to TypeScript top-level experimental_createTool',
    },
  },
];

const checkMethods = () => {
  for (const spec of resourceSpecs) {
    checkDiff({
      scope: spec.scope,
      typescript: extractTypeScriptMethods(...spec.ts),
      python: extractPythonMethods(...spec.py),
      allowTypeScriptOnly: spec.allowTypeScriptOnly,
      allowPythonOnly: spec.allowPythonOnly,
    });
  }
};

const providerDirName = (provider, language) =>
  language === 'typescript' ? provider.replace(/_/g, '-') : provider.replace(/-/g, '_');

const parseProviderMatrix = () => {
  const policy = read('docs/decisions/cross-sdk-parity-policy.md');
  const start = policy.indexOf('### Providers');
  if (start === -1) {
    fail('cross-sdk parity policy has no provider matrix');
    return [];
  }

  const end = policy.indexOf('\n## ', start + 1);
  const section = policy.slice(start, end === -1 ? undefined : end);
  const rows = [];

  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length < 4 || cells[0] === 'Provider' || /^-+$/.test(cells[0])) {
      continue;
    }
    rows.push({
      provider: cells[0].replace(/`/g, '').replace(/\s*\([^)]*\)/g, '').trim(),
      typescript: cells[1],
      python: cells[2],
      reason: cells[3],
    });
  }

  return rows;
};

const expectedProviderDir = (row, language) => {
  const status = row[language];
  if (status === 'yes') {
    return providerDirName(row.provider, language);
  }

  const currentMatch = status.match(/currently `([^`]+)`/);
  if (currentMatch) {
    return providerDirName(currentMatch[1], language);
  }

  if (status === 'n/a-by-design') {
    return null;
  }

  fail(`provider matrix: unsupported ${language} status "${status}" for ${row.provider}`);
  return null;
};

const actualProviderDirs = (relativePath, manifestName) =>
  new Set(
    fs
      .readdirSync(path.join(repoRoot, relativePath), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => fs.existsSync(path.join(repoRoot, relativePath, name, manifestName)))
  );

const checkProviders = () => {
  const rows = parseProviderMatrix();
  const tsExpected = new Set();
  const pyExpected = new Set();

  for (const row of rows) {
    const tsDir = expectedProviderDir(row, 'typescript');
    const pyDir = expectedProviderDir(row, 'python');
    if (tsDir) {
      tsExpected.add(tsDir);
    }
    if (pyDir) {
      pyExpected.add(pyDir);
    }
  }

  checkExactSet(
    'TypeScript provider directories',
    actualProviderDirs('ts/packages/providers', 'package.json'),
    tsExpected
  );
  checkExactSet(
    'Python provider directories',
    actualProviderDirs('python/providers', 'pyproject.toml'),
    pyExpected
  );
};

const expectedGeneratedClientPins = {
  typescript: '0.1.0-alpha.74',
  python: '1.41.0',
};

const checkGeneratedClientPins = () => {
  const workspace = read('pnpm-workspace.yaml');
  const tsCatalogMatch = workspace.match(/^\s+'@composio\/client':\s*['"]?([^'"\s#]+)['"]?/m);
  const corePackage = readJson('ts/packages/core/package.json');
  const pyproject = read('python/pyproject.toml');
  const setup = read('python/setup.py');
  const pyprojectMatch = pyproject.match(/"composio-client==([^"]+)"/);
  const setupMatch = setup.match(/"composio-client==([^"]+)"/);

  if (!tsCatalogMatch) {
    fail('generated-client pins: missing @composio/client catalog pin in pnpm-workspace.yaml');
  } else if (tsCatalogMatch[1] !== expectedGeneratedClientPins.typescript) {
    fail(
      `generated-client pins: @composio/client is ${tsCatalogMatch[1]}, expected ${expectedGeneratedClientPins.typescript}`
    );
  }

  if (corePackage.dependencies?.['@composio/client'] !== 'catalog:') {
    fail('generated-client pins: @composio/core must depend on @composio/client via catalog:');
  }

  if (!pyprojectMatch) {
    fail('generated-client pins: missing composio-client pin in python/pyproject.toml');
  } else if (pyprojectMatch[1] !== expectedGeneratedClientPins.python) {
    fail(
      `generated-client pins: python/pyproject.toml has composio-client ${pyprojectMatch[1]}, expected ${expectedGeneratedClientPins.python}`
    );
  }

  if (!setupMatch) {
    fail('generated-client pins: missing composio-client pin in python/setup.py');
  } else if (setupMatch[1] !== expectedGeneratedClientPins.python) {
    fail(
      `generated-client pins: python/setup.py has composio-client ${setupMatch[1]}, expected ${expectedGeneratedClientPins.python}`
    );
  }

  if (pyprojectMatch && setupMatch && pyprojectMatch[1] !== setupMatch[1]) {
    fail(
      `generated-client pins: python/pyproject.toml (${pyprojectMatch[1]}) and python/setup.py (${setupMatch[1]}) disagree`
    );
  }
};

checkRootNamespaces();
checkMethods();
checkProviders();
checkGeneratedClientPins();

if (failures.length > 0) {
  console.error('SDK parity validation failed:');
  console.error(failures.map(message => `- ${message}`).join('\n'));
  if (allowed.length > 0) {
    console.error(`\nDeclared current gaps (${allowed.length}):`);
    console.error(allowed.map(message => `- ${message}`).join('\n'));
  }
  process.exit(1);
}

console.log(
  `SDK parity validation passed (${resourceSpecs.length} method surfaces, ${parseProviderMatrix().length} provider rows, ${allowed.length} declared current gaps).`
);
