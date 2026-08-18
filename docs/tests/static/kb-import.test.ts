import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildSupportKnowledgeSnapshot,
  parseSupportKnowledgeDocument,
  verifySupportKnowledgeCheckout,
  writeSupportKnowledgeSnapshot,
} from '@/lib/kb/support-knowledge';
import type { KbManifest } from '@/lib/kb/types';

const publicDocument = `---
type: "reference"
title: "GitHub"
description: "Public support knowledge for GitHub."
classification: "public"
product:
  - "platform"
  - "for-you"
category:
  - "authentication"
  - "errors-and-troubleshooting"
owner: "support"
timestamp: "2026-06-24T00:00:00Z"
last_reviewed: "2026-08-12"
review_by: "2026-11-10"
tags:
  - "github"
---
# GitHub

Use this for GitHub setup and troubleshooting.

## Tokens are redacted

Provider tokens are redacted from connected-account responses.

## Create triggers directly

Create the trigger instance directly; a separate webhook endpoint is not required.
`;

const customerSafeDocument = publicDocument
  .replace('title: "GitHub"', 'title: "Private GitHub guidance"')
  .replace('classification: "public"', 'classification: "customer-safe"')
  .replace('timestamp: "2026-06-24T00:00:00Z"\n', '');

function writeDocument(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function previousManifest(): KbManifest {
  return {
    schemaVersion: 2,
    source: {
      repository: 'ComposioHQ/public-kb',
      commit: 'old1234',
      capturedAt: '2026-07-26',
      contentHash: 'sha256:previous',
    },
    topics: [
      {
        slug: 'authentication',
        title: 'Authentication',
        description: 'Authentication guidance.',
        featuredRank: 1,
      },
      {
        slug: 'errors-and-troubleshooting',
        title: 'Errors and troubleshooting',
        description: 'Troubleshooting guidance.',
        featuredRank: 2,
      },
    ],
    guides: [
      {
        slug: 'github-troubleshooting',
        title: 'GitHub troubleshooting',
        description: 'Old grouped page.',
        articlePath: 'github-troubleshooting.md',
        sources: [
          { sourcePath: 'toolkits/github/public.md', sourceHeading: 'Tokens are redacted' },
        ],
        topics: ['authentication'],
        tags: ['github'],
        aliases: ['old-github-answer'],
        relatedGuides: [],
        externalResources: [],
        updatedAt: '2026-07-26',
        lastVerifiedAt: '2026-07-26',
        reviewAfter: '2026-12-31',
        freshness: 'evergreen',
        state: 'published',
        featured: false,
      },
    ],
  };
}

describe('support-knowledge snapshot import', () => {
  test('verifies the checkout repository and exact source commit', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'support-knowledge-git-'));
    git(sourceRoot, 'init');
    git(sourceRoot, 'config', 'user.name', 'KB Import Test');
    git(sourceRoot, 'config', 'user.email', 'kb-import@example.com');
    writeFileSync(join(sourceRoot, 'README.md'), 'first\n', 'utf8');
    writeFileSync(join(sourceRoot, '.gitignore'), 'ignored/\n', 'utf8');
    git(sourceRoot, 'add', 'README.md', '.gitignore');
    git(sourceRoot, 'commit', '-m', 'first');
    const firstCommit = git(sourceRoot, 'rev-parse', 'HEAD');
    git(sourceRoot, 'remote', 'add', 'origin', 'git@github.com:OtherOrg/support-knowledge.git');

    expect(() => verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit: firstCommit }))
      .toThrow('expected ComposioHQ/support-knowledge');

    git(sourceRoot, 'remote', 'set-url', 'origin', 'https://github.com/ComposioHQ/support-knowledge.git');
    expect(verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit: firstCommit }))
      .toBe(firstCommit);

    writeFileSync(join(sourceRoot, 'README.md'), 'dirty\n', 'utf8');
    expect(() => verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit: firstCommit }))
      .toThrow('has uncommitted changes');
    git(sourceRoot, 'restore', 'README.md');

    writeDocument(sourceRoot, 'ignored/public.md', publicDocument);
    expect(() => verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit: firstCommit }))
      .toThrow('contains ignored knowledge files');
    rmSync(join(sourceRoot, 'ignored'), { recursive: true });

    writeFileSync(join(sourceRoot, 'README.md'), 'second\n', 'utf8');
    git(sourceRoot, 'add', 'README.md');
    git(sourceRoot, 'commit', '-m', 'second');
    expect(() => verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit: firstCommit }))
      .toThrow('does not match requested commit');
  });

  test('copies only public leaves and preserves old public guide URLs as aliases', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'support-knowledge-import-'));
    writeDocument(sourceRoot, 'toolkits/github/public.md', publicDocument);
    writeDocument(sourceRoot, 'toolkits/github/customer-safe.md', customerSafeDocument);

    const snapshot = buildSupportKnowledgeSnapshot({
      sourceRoot,
      sourceCommit: 'abc1234',
      previousManifest: previousManifest(),
      now: new Date('2026-08-17T00:00:00Z'),
    });

    expect([...snapshot.sourceFiles.keys()]).toEqual(['toolkits/github/public.md']);
    expect([...snapshot.articleFiles.keys()]).toEqual(['toolkits-github.md']);
    expect(JSON.stringify(snapshot)).not.toContain('customer-safe');
    expect(snapshot.manifest.source).toEqual({
      repository: 'ComposioHQ/support-knowledge',
      commit: 'abc1234',
      capturedAt: '2026-08-17',
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(snapshot.manifest.guides).toHaveLength(1);
    expect(snapshot.manifest.guides[0]).toMatchObject({
      slug: 'toolkits-github',
      articlePath: 'toolkits-github.md',
      aliases: [
        '/kb/authentication/github-troubleshooting',
        'github-troubleshooting',
        'old-github-answer',
      ],
      sources: [
        { sourcePath: 'toolkits/github/public.md', sourceHeading: 'Tokens are redacted' },
        { sourcePath: 'toolkits/github/public.md', sourceHeading: 'Create triggers directly' },
      ],
      lastVerifiedAt: '2026-08-12',
      reviewAfter: '2026-11-10',
    });
    expect(snapshot.articleFiles.get('toolkits-github.md')).toStartWith(
      'Use this for GitHub setup and troubleshooting.',
    );
  });

  test('assigns a consolidated guide legacy URLs to exactly one successor leaf', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'support-knowledge-import-'));
    writeDocument(
      sourceRoot,
      'toolkits/discord/public.md',
      publicDocument.replaceAll('GitHub', 'Discord'),
    );
    writeDocument(
      sourceRoot,
      'toolkits/discordbot/public.md',
      publicDocument.replaceAll('GitHub', 'Discord Bot'),
    );
    const previous = previousManifest();
    previous.guides = [{
      ...previous.guides[0]!,
      slug: 'discord-bot-troubleshooting',
      aliases: ['choose-discordbot-for-bot-token-operations'],
      sources: [
        { sourcePath: 'toolkits/discord/public.md', sourceHeading: 'Create triggers directly' },
        { sourcePath: 'toolkits/discordbot/public.md', sourceHeading: 'Tokens are redacted' },
        { sourcePath: 'toolkits/discordbot/public.md', sourceHeading: 'Create triggers directly' },
      ],
    }];

    const snapshot = buildSupportKnowledgeSnapshot({
      sourceRoot,
      sourceCommit: 'abc1234',
      previousManifest: previous,
      now: new Date('2026-08-17T00:00:00Z'),
    });
    const discord = snapshot.manifest.guides.find(guide => guide.slug === 'toolkits-discord');
    const discordBot = snapshot.manifest.guides.find(guide => guide.slug === 'toolkits-discordbot');

    expect(discord?.aliases).toEqual([]);
    expect(discordBot?.aliases).toEqual([
      '/kb/authentication/discord-bot-troubleshooting',
      'choose-discordbot-for-bot-token-operations',
      'discord-bot-troubleshooting',
    ]);
  });

  test('rejects a classification that does not match the leaf filename', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'support-knowledge-import-'));
    writeDocument(sourceRoot, 'toolkits/github/public.md', customerSafeDocument);

    expect(() => buildSupportKnowledgeSnapshot({
      sourceRoot,
      sourceCommit: 'abc1234',
      now: new Date('2026-08-17T00:00:00Z'),
    })).toThrow('classification does not match filename');
  });

  test('requires atomic level-two answer sections', () => {
    const withoutSections = publicDocument.replace(
      /## Tokens are redacted[\s\S]*/,
      'Provider tokens are redacted.\n',
    );

    expect(() => parseSupportKnowledgeDocument(
      withoutSections,
      'toolkits/github/public.md',
    )).toThrow('at least one level-two answer section');
  });

  test('keeps the previous snapshot intact until staged validation succeeds', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'support-knowledge-import-'));
    writeDocument(sourceRoot, 'toolkits/github/public.md', publicDocument);
    const snapshot = buildSupportKnowledgeSnapshot({
      sourceRoot,
      sourceCommit: 'abc1234',
      now: new Date('2026-08-17T00:00:00Z'),
    });
    const destinationParent = mkdtempSync(join(tmpdir(), 'support-knowledge-destination-'));
    const targetRoot = join(destinationParent, 'kb');
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(join(targetRoot, 'previous.txt'), 'keep me', 'utf8');
    mkdirSync(join(targetRoot, 'external-sources'), { recursive: true });
    writeFileSync(
      join(targetRoot, 'external-sources/auth-guides.json'),
      '{"preserve":true}\n',
      'utf8',
    );

    expect(() => writeSupportKnowledgeSnapshot({
      snapshot,
      targetRoot,
      validate: () => { throw new Error('staged snapshot is invalid'); },
    })).toThrow('staged snapshot is invalid');
    expect(readFileSync(join(targetRoot, 'previous.txt'), 'utf8')).toBe('keep me');

    writeSupportKnowledgeSnapshot({ snapshot, targetRoot, validate: () => undefined });
    expect(existsSync(join(targetRoot, 'previous.txt'))).toBe(false);
    expect(JSON.parse(readFileSync(join(targetRoot, 'manifest.json'), 'utf8')).source).toEqual({
      repository: 'ComposioHQ/support-knowledge',
      commit: 'abc1234',
      capturedAt: '2026-08-17',
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(readFileSync(join(targetRoot, 'articles/toolkits-github.md'), 'utf8')).toContain(
      '## Tokens are redacted',
    );
    expect(readFileSync(
      join(targetRoot, 'external-sources/auth-guides.json'),
      'utf8',
    )).toBe('{"preserve":true}\n');
  });
});
