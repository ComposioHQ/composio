#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

// Canonical taxonomy gate. Keep in sync with the skill-routing list in `AGENTS.md`
// and the taxonomy in `GOAL.md`; adding/removing a skill means editing all three.
// This list is used ONLY to assert the on-disk taxonomy — the command scan below
// derives its file set from disk so it cannot drift from this literal.
const expectedSkills = [
  'bug-fixing',
  'cli-command',
  'cli-e2e',
  'cross-sdk-parity',
  'docs-decisions',
  'eve',
  'python-providers',
  'python-release',
  'python-sdk',
  'python-testing',
  'repo-guidance',
  'skill-maintenance',
  'typescript-providers',
  'typescript-sdk',
  'typescript-testing',
];

const requiredAgentFiles = [
  'AGENTS.md',
  'docs/AGENTS.md',
  'ts/AGENTS.md',
  'ts/packages/core/AGENTS.md',
  'ts/packages/providers/AGENTS.md',
  'ts/packages/cli/AGENTS.md',
  'ts/e2e-tests/AGENTS.md',
  'python/AGENTS.md',
  'python/providers/AGENTS.md',
];

const errors = [];

const fail = message => errors.push(message);
const readJson = relativePath =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

const rootScripts = new Set(Object.keys(readJson('package.json').scripts ?? {}));
const docsScripts = new Set(Object.keys(readJson('docs/package.json').scripts ?? {}));

const makefile = fs.readFileSync(path.join(repoRoot, 'python/Makefile'), 'utf8');
const makeTargets = new Set([...makefile.matchAll(/^([A-Za-z0-9_-]+):/gm)].map(match => match[1]));

const noxfile = fs.readFileSync(path.join(repoRoot, 'python/noxfile.py'), 'utf8');
const noxSessions = new Set(
  [...noxfile.matchAll(/^def ([A-Za-z0-9_]+)\(/gm)].map(match => match[1])
);

for (const match of makefile.matchAll(/\bnox\s+-s\s+([A-Za-z0-9_]+)/g)) {
  const session = match[1];
  if (!noxSessions.has(session)) {
    fail(`python/Makefile calls missing nox session "${session}"`);
  }
}

const parseFrontmatter = (content, relativePath) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    fail(`${relativePath}: missing YAML frontmatter`);
    return null;
  }

  const data = {};
  for (const line of match[1].split('\n')) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      fail(`${relativePath}: unsupported frontmatter line "${line}"`);
      continue;
    }
    data[keyMatch[1]] = keyMatch[2].replace(/^"(.*)"$/, '$1').trim();
  }

  const keys = Object.keys(data).sort();
  const allowed = ['description', 'name'];
  const extra = keys.filter(key => !allowed.includes(key));
  if (extra.length > 0) {
    fail(`${relativePath}: frontmatter has unsupported keys ${extra.join(', ')}`);
  }

  for (const key of allowed) {
    if (!data[key]) {
      fail(`${relativePath}: missing frontmatter key ${key}`);
    }
  }

  return { data };
};

const skillsRoot = path.join(repoRoot, '.agents/skills');
if (!fs.existsSync(skillsRoot)) {
  fail('.agents/skills does not exist');
} else {
  const actualSkills = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  const expected = [...expectedSkills].sort();
  if (actualSkills.join('\n') !== expected.join('\n')) {
    fail(
      `.agents/skills taxonomy mismatch.\nExpected:\n${expected.join('\n')}\nActual:\n${actualSkills.join('\n')}`
    );
  }

  for (const skillName of actualSkills) {
    const skillDir = path.join(skillsRoot, skillName);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const relativeSkillMd = path.relative(repoRoot, skillMd);

    if (!fs.existsSync(skillMd)) {
      fail(`${skillName}: missing SKILL.md`);
      continue;
    }

    const content = fs.readFileSync(skillMd, 'utf8');
    const parsed = parseFrontmatter(content, relativeSkillMd);
    if (!parsed) {
      continue;
    }

    if (parsed.data.name !== skillName) {
      fail(`${relativeSkillMd}: name "${parsed.data.name}" must match directory "${skillName}"`);
    }

    if (!/^[a-z0-9-]+$/.test(parsed.data.name)) {
      fail(`${relativeSkillMd}: name must use lowercase letters, digits, and hyphens`);
    }

    if (parsed.data.description.length > 1024) {
      fail(`${relativeSkillMd}: description exceeds 1024 characters`);
    }

    if (!/\bUse\b/.test(parsed.data.description)) {
      fail(`${relativeSkillMd}: description must include trigger boundaries with "Use"`);
    }

    const lineCount = content.split('\n').length;
    if (lineCount > 80) {
      fail(`${relativeSkillMd}: SKILL.md should stay short; found ${lineCount} lines`);
    }

    const referencesDir = path.join(skillDir, 'references');
    if (!fs.existsSync(referencesDir)) {
      fail(`${skillName}: missing references directory`);
      continue;
    }

    const referenceEntries = fs.readdirSync(referencesDir, { withFileTypes: true });
    const referenceFiles = referenceEntries.filter(
      entry => entry.isFile() && entry.name.endsWith('.md')
    );
    if (referenceFiles.length === 0) {
      fail(`${skillName}: references directory must contain markdown files`);
    }

    for (const entry of referenceEntries) {
      if (entry.isDirectory()) {
        fail(`${skillName}: references must be first-level files, found directory ${entry.name}`);
      }
      if (entry.isFile() && !entry.name.endsWith('.md')) {
        fail(`${skillName}: reference ${entry.name} must be markdown`);
      }
    }

    for (const reference of referenceFiles) {
      const marker = `references/${reference.name}`;
      if (!content.includes(marker)) {
        fail(`${relativeSkillMd}: does not link ${marker}`);
      }
    }
  }
}

const claudeSkills = path.join(repoRoot, '.claude/skills');
if (!fs.existsSync(claudeSkills)) {
  fail('.claude/skills is missing');
} else {
  const stat = fs.lstatSync(claudeSkills);
  if (!stat.isSymbolicLink()) {
    fail('.claude/skills must be a symlink to .agents/skills');
  } else {
    const linkTarget = fs.readlinkSync(claudeSkills);
    if (linkTarget !== '../.agents/skills') {
      fail(`.claude/skills points to ${linkTarget}, expected ../.agents/skills`);
    }
  }
}

for (const relativePath of requiredAgentFiles) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing required nested guidance file ${relativePath}`);
  }
}

if (fs.existsSync(path.join(repoRoot, 'docs', '.claude'))) {
  fail('docs-specific guidance must live under docs/agent-guidance and docs/decisions');
}

if (fs.existsSync(path.join(repoRoot, 'ts/packages/cli', '.cursor'))) {
  fail('CLI Cursor-specific metadata should be retired after migration');
}

if (fs.existsSync(path.join(repoRoot, '.claude', 'rules'))) {
  fail('Claude-only rule files should be migrated into neutral guidance');
}

for (const relativePath of ['docs/decisions/README.md', 'docs/agent-guidance/README.md']) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing ${relativePath}`);
  }
}

const ignoredDirs = new Set([
  '.git',
  'node_modules',
  '.turbo',
  '.ruff_cache',
  '.venv',
  'dist',
  'build',
]);

const ignoredFiles = new Set(['GOAL.md', 'PLAN.md', 'HANDOFF.md', 'RELEASE_NOTES.md']);
const textExtensions = new Set([
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
]);

const stalePatterns = [
  ['docs', '.claude'].join('/'),
  ['.claude', 'context'].join('/'),
  ['.claude', 'decisions'].join('/'),
  ['.claude', 'guides'].join('/'),
  ['.claude', 'rules'].join('/'),
  ['.Codex', 'rules'].join('/'),
  ['.cursor', 'rules'].join('/'),
  ['', 'workspace', 'zen'].join('/'),
  'CLI' + '.md',
];

const walk = dir => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      walk(absolutePath);
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(relativePath)) {
      continue;
    }

    if (!textExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const pattern of stalePatterns) {
      if (text.includes(pattern)) {
        fail(`${relativePath}: stale guidance reference "${pattern}"`);
      }
    }
  }
};

walk(repoRoot);

const validatePnpmCommands = (relativePath, text) => {
  const commandLines = text
    .split('\n')
    .map(line => line.trim().replace(/^\$\s+/, ''))
    .filter(line => line.startsWith('pnpm ') || line.startsWith('pnpm run '));

  for (const line of commandLines) {
    const match = line.match(/^pnpm(?:\s+run)?\s+([^\s`]+)/);
    if (!match) {
      continue;
    }
    const command = match[1];
    if (
      command.startsWith('-') ||
      command === 'install' ||
      command === 'exec' ||
      command === 'turbo'
    ) {
      continue;
    }
    if (!rootScripts.has(command)) {
      fail(`${relativePath}: pnpm command "${command}" is not a root package.json script`);
    }
  }
};

const validateBunRunCommands = (relativePath, text) => {
  const commandLines = text
    .split('\n')
    .map(line => line.trim().replace(/^\$\s+/, ''))
    .filter(line => line.startsWith('bun run '));

  for (const line of commandLines) {
    const match = line.match(/^bun\s+run\s+([^\s`]+)/);
    if (!match) {
      continue;
    }
    const command = match[1];
    if (!docsScripts.has(command)) {
      fail(`${relativePath}: bun run command "${command}" is not a docs package.json script`);
    }
  }
};

const validateMakeCommands = (relativePath, text) => {
  const commandLines = text
    .split('\n')
    .map(line => line.trim().replace(/^\$\s+/, ''))
    .filter(line => line.startsWith('make '));

  for (const line of commandLines) {
    const match = line.match(/^make\s+([A-Za-z0-9_-]+)/);
    if (!match) {
      continue;
    }
    const command = match[1];
    if (!makeTargets.has(command)) {
      fail(`${relativePath}: make target "${command}" is not in python/Makefile`);
    }
  }
};

const validateNoxCommands = (relativePath, text) => {
  const commandLines = text
    .split('\n')
    .map(line => line.trim().replace(/^\$\s+/, ''))
    .filter(line => line.startsWith('nox -s '));

  for (const line of commandLines) {
    const match = line.match(/^nox\s+-s\s+([A-Za-z0-9_]+)/);
    if (!match) {
      continue;
    }
    const command = match[1];
    if (!noxSessions.has(command)) {
      fail(`${relativePath}: nox session "${command}" is not in python/noxfile.py`);
    }
  }
};

// Derive the command-scan file set from the skills actually on disk so it can never
// drift from `expectedSkills` (which serves only as the taxonomy gate above).
const skillDirNames = fs.existsSync(skillsRoot)
  ? fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  : [];

const commandFiles = [
  ...skillDirNames.flatMap(skillName => {
    const skillDir = path.join(skillsRoot, skillName);
    if (!fs.existsSync(skillDir)) {
      return [];
    }
    const files = [];
    const collect = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(absolutePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(absolutePath);
        }
      }
    };
    collect(skillDir);
    return files;
  }),
  ...requiredAgentFiles.map(relativePath => path.join(repoRoot, relativePath)),
];

for (const absolutePath of commandFiles) {
  if (!fs.existsSync(absolutePath)) {
    continue;
  }
  const relativePath = path.relative(repoRoot, absolutePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  validatePnpmCommands(relativePath, text);
  validateBunRunCommands(relativePath, text);
  validateMakeCommands(relativePath, text);
  validateNoxCommands(relativePath, text);
}

if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Validated ${expectedSkills.length} canonical agent skills and guidance invariants.`);
