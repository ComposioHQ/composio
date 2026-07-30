import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  AttemptReceiptSchema,
  RegistryObservationSchema,
  ReleaseRequestSchema,
  SealedManifestSchema,
  StateTransitionSchema,
} from '../.github/scripts/sdk-release/contracts';
import {
  assertSealedManifestUnchanged,
  sealManifest,
} from '../.github/scripts/sdk-release/manifest';
import { assertCanStartRelease, transitionRelease } from '../.github/scripts/sdk-release/state';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/sdk-release/manifest-${name}.json`, import.meta.url), 'utf8')
  );

const clone = <T>(value: T): T => structuredClone(value);

describe('SDK release manifest contract', () => {
  test('accepts TypeScript-only, Python-only, and combined manifests', () => {
    for (const name of ['typescript-only', 'python-only', 'combined']) {
      expect(SealedManifestSchema.safeParse(fixture(name)).success).toBe(true);
    }
  });

  test('rejects a request and manifest that select neither ecosystem', () => {
    expect(
      ReleaseRequestSchema.safeParse({
        schema_version: 'sdk-release-request/v1',
        operation: 'prepare',
        release_id: 'release-1',
        scope: 'neither',
      }).success
    ).toBe(false);
    expect(SealedManifestSchema.safeParse(fixture('neither-selected')).success).toBe(false);
  });

  test('rejects unknown fields, incomplete generation records, duplicates, bad versions, wrong registries, ignored CLI, and incomplete Python family', () => {
    const valid = fixture('combined') as Record<string, any>;
    const mutations: Array<(value: Record<string, any>) => void> = [
      value => {
        value.unknown = true;
      },
      value => {
        delete value.openai_generation.generation_key;
      },
      value => {
        value.packages.push(clone(value.packages[0]));
      },
      value => {
        value.artifacts.push(clone(value.artifacts[0]));
      },
      value => {
        value.packages[0].version = 'next';
      },
      value => {
        value.packages[0].registry = 'pypi';
      },
      value => {
        delete value.artifacts[0].integrity;
      },
      value => {
        value.packages[0].name = '@composio/cli';
      },
      value => {
        value.python_release_family.pop();
      },
    ];

    for (const mutate of mutations) {
      const candidate = clone(valid);
      mutate(candidate);
      expect(SealedManifestSchema.safeParse(candidate).success).toBe(false);
    }
  });

  test('canonical sealing normalizes packages, artifacts, changesets, and family members', () => {
    const ordered = fixture('combined') as Record<string, any>;
    const reversed = clone(ordered);
    reversed.packages.reverse();
    reversed.artifacts.reverse();
    reversed.changeset_ids.reverse();
    reversed.python_release_family.reverse();

    const first = sealManifest(ordered);
    const second = sealManifest(reversed);
    expect(first.canonical_bytes).toBe(second.canonical_bytes);
    expect(first.manifest_id).toBe(second.manifest_id);
    expect(first.manifest_id).toMatch(/^[a-f0-9]{64}$/);
    expect(first.manifest).not.toHaveProperty('manifest_id');
  });

  test('detects mutation of sealed bytes', () => {
    const sealed = sealManifest(fixture('typescript-only'));
    const changed = clone(sealed.manifest);
    changed.packages[0].version = '1.2.4';
    expect(() => assertSealedManifestUnchanged(sealed.manifest_id, changed)).toThrow();
  });
});

describe('SDK release state contract', () => {
  test('permits only explicit legal pure transitions', () => {
    expect(transitionRelease('requested', 'drafting', 'release-1').to).toBe('drafting');
    expect(() => transitionRelease('requested', 'publishing', 'release-1')).toThrow();
    expect(() => transitionRelease('sealed', 'drafting', 'release-1')).toThrow();
  });

  test('rejects a new lineage while a prior release is open', () => {
    expect(() =>
      assertCanStartRelease({ release_id: 'release-1', state: 'partial' }, 'release-2')
    ).toThrow();
    expect(() =>
      assertCanStartRelease({ release_id: 'release-1', state: 'notified' }, 'release-2')
    ).not.toThrow();
    expect(() =>
      assertCanStartRelease({ release_id: 'release-1', state: 'partial' }, 'release-1')
    ).not.toThrow();
  });

  test('keeps registry, attempt, and transition records strict and versioned', () => {
    expect(RegistryObservationSchema.safeParse({ schema_version: 'wrong' }).success).toBe(false);
    expect(AttemptReceiptSchema.safeParse({ schema_version: 'wrong' }).success).toBe(false);
    expect(StateTransitionSchema.safeParse({ schema_version: 'wrong' }).success).toBe(false);
  });
});
