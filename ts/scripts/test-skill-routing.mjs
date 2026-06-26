#!/usr/bin/env node
// Skill-routing smoke test: a lightweight, deterministic eval that guards against
// SKILL.md description edits silently breaking which skill a task routes to.
//
// For each probe (a representative task plus its distinctive trigger phrases) we
// score every skill by how many of those phrases appear in its description, and
// assert the expected skill is the unique top scorer. This is NOT an LLM eval; it
// catches the common regression: a description loses the terms that made it the
// obvious match, or another skill grows ambiguous overlap. It also fails if a
// skill has no probe, so routing coverage tracks the taxonomy.
//
// Run: pnpm validate:skill-routing  (belongs in the verify/CI aggregate too).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const skillsRoot = path.join(repoRoot, '.agents/skills');

const readDescription = skillName => {
  const file = path.join(skillsRoot, skillName, 'SKILL.md');
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^description:\s*(.*)$/m);
  if (!match) {
    throw new Error(`${skillName}: SKILL.md has no description`);
  }
  return match[1].replace(/^"(.*)"$/, '$1').trim();
};

// Each probe: a representative task and the distinctive trigger phrases that
// should make `expect` the obvious match. Phrases are matched case-insensitively
// as substrings against the skill description.
const probes = [
  {
    task: 'reproduce a reported bug, find the root cause, and add a regression test',
    expect: 'bug-fixing',
    terms: ['root-cause', 'reproduction', 'regression test', 'incorrect SDK behavior'],
  },
  {
    task: 'implement a new Effect CLI command and wire it into the command tree',
    expect: 'cli-command',
    terms: ['@effect/cli', 'command wiring', 'CLI command UX', 'CLI source edits'],
  },
  {
    task: 'write a Docker-based end-to-end test for the composio CLI binary',
    expect: 'cli-e2e',
    terms: ['Docker-based', 'end-to-end tests', 'binary invocation', 'fixture isolation'],
  },
  {
    task: 'align TypeScript and Python behavior after a backend API contract change',
    expect: 'cross-sdk-parity',
    terms: ['backend API contract', 'both SDKs', 'generated client pins', 'comparing TS/Python'],
  },
  {
    task: 'record an ADR and update Fumadocs documentation',
    expect: 'docs-decisions',
    terms: ['Fumadocs', 'ADR-style records', 'docs decisions', 'docs review guidance'],
  },
  {
    task: 'build or debug a durable backend agent with eve channels and schedules',
    expect: 'eve',
    terms: ['durable backend AI agents', 'eve framework', 'channels', 'schedules'],
  },
  {
    task: 'create a Python provider adapter under python/providers with metadata',
    expect: 'python-providers',
    terms: ['python/providers', 'Python provider adapters', 'provider metadata', 'framework-specific dependencies'],
  },
  {
    task: 'publish the Python SDK to PyPI, bump the version and update the client pin',
    expect: 'python-release',
    terms: ['PyPI client pin', 'uv.lock', 'publish verification', 'packaging metadata'],
  },
  {
    task: 'implement Python SDK toolkits, sessions and connected accounts under python/composio',
    expect: 'python-sdk',
    terms: ['python/composio', 'connected accounts', 'Python core runtime', 'shared Python models'],
  },
  {
    task: 'run Python tests with nox, mypy, ruff and pytest markers',
    expect: 'python-testing',
    terms: ['pytest markers', 'mypy', 'sanity tests', 'Python SDK verification'],
  },
  {
    task: 'navigate the monorepo layout and prepare a PR with a changeset',
    expect: 'repo-guidance',
    terms: ['monorepo', 'repo layout', 'changesets', 'generated-file boundaries'],
  },
  {
    task: 'add or update an Agent Skill SKILL.md frontmatter and references',
    expect: 'skill-maintenance',
    terms: ['SKILL.md frontmatter', 'compatibility symlinks', 'agent skills', 'skill taxonomy'],
  },
  {
    task: 'implement a TypeScript provider package adapter for OpenAI and Anthropic',
    expect: 'typescript-providers',
    terms: ['ts/packages/providers', 'TypeScript provider packages', 'Claude Agent SDK', 'framework adapters'],
  },
  {
    task: 'modify @composio/core tool and toolkit behavior and modifiers',
    expect: 'typescript-sdk',
    terms: ['@composio/core', 'modifiers', 'generated SDK surfaces', 'shared TypeScript packages'],
  },
  {
    task: 'run Vitest suites, type checks and lint a TypeScript package',
    expect: 'typescript-testing',
    terms: ['Vitest', 'type checks', 'TypeScript SDK verification', 'runtime E2E tests'],
  },
];

const skillNames = fs
  .readdirSync(skillsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

const descriptions = new Map(skillNames.map(name => [name, readDescription(name).toLowerCase()]));

const failures = [];

// Coverage: every skill must have at least one probe so routing tracks the taxonomy.
const covered = new Set(probes.map(probe => probe.expect));
for (const name of skillNames) {
  if (!covered.has(name)) {
    failures.push(`skill "${name}" has no routing probe; add one to test-skill-routing.mjs`);
  }
}

for (const probe of probes) {
  if (!descriptions.has(probe.expect)) {
    failures.push(`probe "${probe.task}": expected skill "${probe.expect}" does not exist`);
    continue;
  }

  const scores = skillNames.map(name => {
    const description = descriptions.get(name);
    const score = probe.terms.reduce(
      (total, term) => total + (description.includes(term.toLowerCase()) ? 1 : 0),
      0
    );
    return { name, score };
  });

  const maxScore = Math.max(...scores.map(entry => entry.score));
  const winners = scores.filter(entry => entry.score === maxScore).map(entry => entry.name);
  const expectScore = scores.find(entry => entry.name === probe.expect).score;

  if (expectScore === 0) {
    failures.push(
      `probe "${probe.task}": expected "${probe.expect}" matched none of its trigger phrases (description drifted?)`
    );
  } else if (winners.length !== 1 || winners[0] !== probe.expect) {
    const top = scores
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(entry => `${entry.name}=${entry.score}`)
      .join(', ');
    failures.push(
      `probe "${probe.task}": expected unique winner "${probe.expect}" (score ${expectScore}) but top was [${top}]`
    );
  }
}

if (failures.length > 0) {
  console.error('Skill-routing smoke test failed:');
  console.error(failures.map(failure => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(
  `Skill-routing smoke test passed (${probes.length} probes over ${skillNames.length} skills).`
);
