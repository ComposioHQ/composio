#!/usr/bin/env node
// Guards for the SDK release coordinator: deterministic MDX rendering, the
// documented-version table invariant, MDX escaping of model output, and the
// workflow wiring that test/release-workflow.test.ts does not already cover.

import { FileSystem } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Cause, ConfigProvider, Effect } from 'effect';
import {
  OPENAI_MODEL,
  releaseInputHash,
  renderDraft,
  requireOpenAiKey,
} from '../.github/scripts/sdk-release/src/changelog.ts';

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

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;

  const rendered = renderDraft(facts, content, 'deadbeef');

  if (rendered !== renderDraft(facts, content, 'deadbeef')) {
    return yield* Effect.fail(new Error('renderDraft must be deterministic for identical input'));
  }

  for (const expected of [
    'title: "Session lifecycle improvements"',
    'date: "2026-07-30"',
    '{/* sdk-release input-hash deadbeef */}',
    // Headings must match the docs convention used by every existing changelog entry.
    '### SDK versions',
    '### What changed',
    '| TypeScript `@composio/core` | `1.2.3` |',
    '| TypeScript `@composio/openai` | `2.0.0` |',
    '| Python `composio` | `0.19.0` |',
  ]) {
    if (!rendered.includes(expected)) {
      return yield* Effect.fail(new Error(`rendered draft must contain ${JSON.stringify(expected)}`));
    }
  }

  // MDX-active characters in model prose must be escaped outside code spans and
  // preserved inside them, so drafts can never smuggle JSX into the docs build.
  if (!rendered.includes('Use \\{`session.close()`\\} to free \\<resources> now.')) {
    return yield* Effect.fail(
      new Error('renderDraft must escape {, } and < in model output outside code spans')
    );
  }

  const pythonOnly = renderDraft({ ...facts, typescript: [] }, content, 'deadbeef');
  if (pythonOnly.includes('TypeScript') || !pythonOnly.includes('| Python `composio` | `0.19.0` |')) {
    return yield* Effect.fail(
      new Error('renderDraft must render Python-only releases without TypeScript rows')
    );
  }

  if (/^## /m.test(rendered)) {
    return yield* Effect.fail(
      new Error('renderDraft must emit h3 headings, matching docs/content/changelog entries')
    );
  }

  // The draft is reused (and its human edits preserved) when the release identity is
  // unchanged. A UTC day rollover between prepare runs must not invalidate the hash.
  if (releaseInputHash(facts) !== releaseInputHash({ ...facts, date: '2026-08-01' })) {
    return yield* Effect.fail(
      new Error('the changelog input hash must ignore facts.date, or human edits are discarded')
    );
  }
  if (releaseInputHash(facts) === releaseInputHash({ ...facts, typescript: [] })) {
    return yield* Effect.fail(
      new Error('the changelog input hash must change when the released packages change')
    );
  }

  // A missing OPENAI_API_KEY must fail fast with a clear, actionable message —
  // not whatever opaque error the OpenAI client layer would produce deep inside
  // the model call — and must never echo the key's value (Config.option can't).
  // A fixed ConfigProvider swaps out the environment for this one check, rather
  // than mutating process.env, so it can't affect anything else in this process.
  const missingKeyExit = yield* requireOpenAiKey.pipe(
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
    Effect.exit
  );
  if (missingKeyExit._tag !== 'Failure') {
    return yield* Effect.fail(new Error('requireOpenAiKey must fail when OPENAI_API_KEY is unset'));
  }
  const missingKeyMessage = Cause.pretty(missingKeyExit.cause);
  if (!missingKeyMessage.includes('OPENAI_API_KEY is not set')) {
    return yield* Effect.fail(
      new Error(`requireOpenAiKey must explain the missing key, got: ${missingKeyMessage}`)
    );
  }

  const presentKeyExit = yield* requireOpenAiKey.pipe(
    Effect.withConfigProvider(
      ConfigProvider.fromMap(new Map([['OPENAI_API_KEY', 'sk-test-not-a-real-key']]))
    ),
    Effect.exit
  );
  if (presentKeyExit._tag !== 'Success') {
    return yield* Effect.fail(new Error('requireOpenAiKey must succeed when OPENAI_API_KEY is set'));
  }

  // The model snapshot is pinned; alias drift would make releases unreproducible.
  if (!/^gpt-5\.5-\d{4}-\d{2}-\d{2}$/.test(OPENAI_MODEL)) {
    return yield* Effect.fail(
      new Error('OPENAI_MODEL must pin a dated gpt-5.5 snapshot, not a floating alias')
    );
  }

  const workflow = yield* fs.readFileString(
    new URL('../.github/workflows/sdk.release.yml', import.meta.url).pathname
  );

  if (!workflow.includes('environment: sdk-release')) {
    return yield* Effect.fail(
      new Error('sdk.release.yml publish job must be gated by the sdk-release environment')
    );
  }
  if (!workflow.includes('id-token: write')) {
    return yield* Effect.fail(
      new Error('sdk.release.yml must request OIDC tokens for trusted publishing')
    );
  }
  if (!workflow.includes('version: pnpm sdk-release prepare')) {
    return yield* Effect.fail(
      new Error('sdk.release.yml must prepare releases through the sdk-release coordinator')
    );
  }
  if (!workflow.includes('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')) {
    return yield* Effect.fail(
      new Error('sdk.release.yml version job must provide OPENAI_API_KEY for changelog drafts')
    );
  }
  const verifyIdx = workflow.indexOf('run: pnpm sdk-release verify');
  const finalizeIdx = workflow.indexOf('run: pnpm sdk-release finalize');
  if (verifyIdx === -1 || finalizeIdx === -1 || verifyIdx > finalizeIdx) {
    return yield* Effect.fail(
      new Error('sdk.release.yml must verify registries before finalizing the changelog')
    );
  }

  // A missing/misconfigured Slack webhook must never block the release: it
  // must be gated behind continue-on-error, and must run before Python
  // publish/verify/finalize so a failure there can't skip them either.
  const changesetsPublishIdx = workflow.indexOf('id: changesets');
  const slackNotifyIdx = workflow.indexOf('uses: slackapi/slack-github-action@');
  const pythonPublishIdx = workflow.indexOf('name: Publish Python package');
  if (
    changesetsPublishIdx === -1 ||
    slackNotifyIdx === -1 ||
    pythonPublishIdx === -1 ||
    !(changesetsPublishIdx < slackNotifyIdx && slackNotifyIdx < pythonPublishIdx)
  ) {
    return yield* Effect.fail(
      new Error(
        'sdk.release.yml must notify Slack after publishing npm packages and before Python publish'
      )
    );
  }
  if (!workflow.includes('webhook: ${{ secrets.SLACK_RELEASE_WEBHOOK_URL }}')) {
    return yield* Effect.fail(
      new Error('sdk.release.yml must send the npm release notification via SLACK_RELEASE_WEBHOOK_URL')
    );
  }
  const slackStepIdx = workflow.lastIndexOf('name: Send Slack notification');
  const continueOnErrorIdx = workflow.indexOf('continue-on-error: true', slackStepIdx);
  if (
    slackStepIdx === -1 ||
    continueOnErrorIdx === -1 ||
    continueOnErrorIdx > workflow.indexOf('uses: slackapi/slack-github-action@', slackStepIdx)
  ) {
    return yield* Effect.fail(
      new Error('sdk.release.yml Slack notification must not block the release on failure')
    );
  }

  yield* Effect.log('sdk release changelog test passed');
});

program.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
