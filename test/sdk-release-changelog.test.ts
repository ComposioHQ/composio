#!/usr/bin/env node
// Guards for the SDK release coordinator: deterministic MDX rendering, the
// documented-version table invariant, MDX escaping of model output, and the
// workflow wiring that test/release-workflow.test.ts does not already cover.

import { readFileSync } from 'node:fs';
import { OPENAI_MODEL, renderDraft } from '../.github/scripts/sdk-release/src/changelog.ts';

const facts = {
  date: '2026-07-30',
  typescript: [
    { name: '@composio/core', version: '1.2.3', summaries: ['Add `Session.close()` support'] },
    { name: '@composio/openai', version: '2.0.0', summaries: [] },
  ],
  python: { name: 'composio', version: '0.19.0' },
};

const content = {
  title: 'Session lifecycle improvements',
  description: 'Close sessions explicitly from the SDK.',
  sections: [{ heading: 'What changed', body: 'Use {`session.close()`} to free <resources> now.' }],
};

const rendered = renderDraft(facts, content, 'deadbeef');

if (rendered !== renderDraft(facts, content, 'deadbeef')) {
  throw new Error('renderDraft must be deterministic for identical input');
}

for (const expected of [
  'title: "Session lifecycle improvements"',
  'date: "2026-07-30"',
  '{/* sdk-release input-hash deadbeef */}',
  '| TypeScript `@composio/core` | `1.2.3` |',
  '| TypeScript `@composio/openai` | `2.0.0` |',
  '| Python `composio` | `0.19.0` |',
]) {
  if (!rendered.includes(expected)) {
    throw new Error(`rendered draft must contain ${JSON.stringify(expected)}`);
  }
}

// MDX-active characters in model prose must be escaped outside code spans and
// preserved inside them, so drafts can never smuggle JSX into the docs build.
if (!rendered.includes('Use \\{`session.close()`\\} to free \\<resources> now.')) {
  throw new Error('renderDraft must escape {, } and < in model output outside code spans');
}

const pythonOnly = renderDraft({ ...facts, typescript: [] }, content, 'deadbeef');
if (pythonOnly.includes('TypeScript') || !pythonOnly.includes('| Python `composio` | `0.19.0` |')) {
  throw new Error('renderDraft must render Python-only releases without TypeScript rows');
}

// The model snapshot is pinned; alias drift would make releases unreproducible.
if (!/^gpt-5\.5-\d{4}-\d{2}-\d{2}$/.test(OPENAI_MODEL)) {
  throw new Error('OPENAI_MODEL must pin a dated gpt-5.5 snapshot, not a floating alias');
}

const workflow = readFileSync(
  new URL('../.github/workflows/sdk.release.yml', import.meta.url),
  'utf8'
);

if (!workflow.includes('environment: sdk-release')) {
  throw new Error('sdk.release.yml publish job must be gated by the sdk-release environment');
}
if (!workflow.includes('id-token: write')) {
  throw new Error('sdk.release.yml must request OIDC tokens for trusted publishing');
}
if (!workflow.includes('version: pnpm sdk-release prepare')) {
  throw new Error('sdk.release.yml must prepare releases through the sdk-release coordinator');
}
if (!workflow.includes('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')) {
  throw new Error('sdk.release.yml version job must provide OPENAI_API_KEY for changelog drafts');
}
const verifyIdx = workflow.indexOf('run: pnpm sdk-release verify');
const finalizeIdx = workflow.indexOf('run: pnpm sdk-release finalize');
if (verifyIdx === -1 || finalizeIdx === -1 || verifyIdx > finalizeIdx) {
  throw new Error('sdk.release.yml must verify registries before finalizing the changelog');
}

console.log('sdk release changelog test passed');
