import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  RegistryConsistencyTimeoutError,
  filterAbsentArtifacts,
  reconcileRelease,
  verifyRegistryConsistency,
} from '../.github/scripts/sdk-release/reconcile';
import {
  RegistryTransientError,
  registryFetch as fetchRegistry,
} from '../.github/scripts/sdk-release/registry/npm';

const MANIFEST_ID = 'a'.repeat(64);
const NOW = '2026-07-30T00:00:00.000Z';
const npmBytes = new TextEncoder().encode('sealed npm tarball');
const pythonWheel = new TextEncoder().encode('sealed python wheel');
const pythonSdist = new TextEncoder().encode('sealed python sdist');

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function integrity(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

const npmPackage = {
  ecosystem: 'typescript' as const,
  name: '@composio/core',
  version: '0.15.0',
  registry: 'npm' as const,
  dist_tag: 'latest',
};
const pythonPackage = {
  ecosystem: 'python' as const,
  name: 'composio',
  version: '0.19.0',
  registry: 'pypi' as const,
};
const npmArtifact = {
  ecosystem: 'typescript' as const,
  package_name: npmPackage.name,
  registry: 'npm' as const,
  filename: 'composio-core-0.15.0.tgz',
  sha256: sha256(npmBytes),
  integrity: integrity(npmBytes),
};
const wheelArtifact = {
  ecosystem: 'python' as const,
  package_name: pythonPackage.name,
  registry: 'pypi' as const,
  filename: 'composio-0.19.0-py3-none-any.whl',
  sha256: sha256(pythonWheel),
};
const sdistArtifact = {
  ecosystem: 'python' as const,
  package_name: pythonPackage.name,
  registry: 'pypi' as const,
  filename: 'composio-0.19.0.tar.gz',
  sha256: sha256(pythonSdist),
};

function npmVersionDocument(overrides: Record<string, unknown> = {}) {
  return {
    name: npmPackage.name,
    version: npmPackage.version,
    dist: {
      tarball: 'https://registry.npmjs.org/@composio/core/-/core-0.15.0.tgz',
      integrity: npmArtifact.integrity,
    },
    ...overrides,
  };
}

function pypiDocument(
  urls: Array<{ filename: string; sha256: string }> = [
    { filename: wheelArtifact.filename, sha256: wheelArtifact.sha256 },
    { filename: sdistArtifact.filename, sha256: sdistArtifact.sha256 },
  ]
) {
  return {
    info: { name: pythonPackage.name, version: pythonPackage.version },
    urls: urls.map(file => ({
      filename: file.filename,
      digests: { sha256: file.sha256 },
      packagetype: file.filename.endsWith('.whl') ? 'bdist_wheel' : 'sdist',
    })),
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function registryFetch(options: {
  npm?: 'absent' | 'exact' | 'wrong-tag' | 'conflict';
  pypi?: 'absent' | 'exact' | 'extra' | 'missing' | 'conflict';
}): typeof fetch {
  return (async input => {
    const url = String(input);
    if (url.includes('pypi.org/pypi/')) {
      if (options.pypi === 'absent') return new Response('', { status: 404 });
      const expected = pypiDocument();
      if (options.pypi === 'extra') {
        expected.urls.push({
          filename: 'composio-0.19.0-cp313-manylinux.whl',
          digests: { sha256: 'b'.repeat(64) },
          packagetype: 'bdist_wheel',
        });
      }
      if (options.pypi === 'missing') expected.urls.pop();
      if (options.pypi === 'conflict') expected.urls[0]!.digests.sha256 = 'c'.repeat(64);
      return json(expected);
    }
    if (url.endsWith('/@composio%2Fcore/0.15.0')) {
      if (options.npm === 'absent') return new Response('', { status: 404 });
      if (options.npm === 'conflict') {
        return json(
          npmVersionDocument({
            dist: {
              tarball: 'https://registry.npmjs.org/@composio/core/-/core-0.15.0.tgz',
              integrity: `sha512-${Buffer.alloc(64, 9).toString('base64')}`,
            },
          })
        );
      }
      return json(npmVersionDocument());
    }
    if (url.endsWith('/@composio%2Fcore')) {
      return json({
        name: npmPackage.name,
        'dist-tags': {
          latest: options.npm === 'wrong-tag' ? '0.14.9' : npmPackage.version,
        },
      });
    }
    if (url.endsWith('/core-0.15.0.tgz')) return new Response(npmBytes);
    throw new Error(`Unexpected registry URL ${url}`);
  }) as typeof fetch;
}

describe('exact npm and PyPI registry observations', () => {
  test('classifies 404 as absent and exact bytes/file sets as exact', async () => {
    const absent = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'absent', pypi: 'absent' }),
      now: () => NOW,
    });
    expect(absent.observations.map(observation => observation.state)).toEqual(['absent', 'absent']);
    expect(absent.can_publish).toBe(true);

    const exact = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'exact', pypi: 'exact' }),
      now: () => NOW,
    });
    expect(exact.observations.map(observation => observation.state)).toEqual(['exact', 'exact']);
    expect(exact.observations[0]).toMatchObject({
      expected_dist_tag: 'latest',
      observed_dist_tag: 'latest',
      expected_artifacts: [{ integrity: npmArtifact.integrity }],
      observed_artifacts: [{ integrity: npmArtifact.integrity }],
    });
  });

  test('detects npm digest/tag conflicts and complete PyPI set drift', async () => {
    for (const npm of ['wrong-tag', 'conflict'] as const) {
      const plan = await reconcileRelease({
        manifest_id: MANIFEST_ID,
        packages: [npmPackage],
        artifacts: [npmArtifact],
        fetch: registryFetch({ npm }),
        now: () => NOW,
      });
      expect(plan.observations[0]?.state).toBe('conflict');
      expect(plan.can_publish).toBe(false);
    }

    for (const pypi of ['extra', 'missing', 'conflict'] as const) {
      const plan = await reconcileRelease({
        manifest_id: MANIFEST_ID,
        packages: [pythonPackage],
        artifacts: [wheelArtifact, sdistArtifact],
        fetch: registryFetch({ pypi }),
        now: () => NOW,
      });
      expect(plan.observations[0]?.state).toBe('conflict');
      expect(plan.can_publish).toBe(false);
    }
  });

  test('rejects malformed responses and distinguishes transient registry errors', async () => {
    const malformedFetch = (async input =>
      String(input).includes('/0.15.0')
        ? json({ name: npmPackage.name, version: npmPackage.version, dist: {} })
        : json({})) as typeof fetch;
    await expect(
      reconcileRelease({
        manifest_id: MANIFEST_ID,
        packages: [npmPackage],
        artifacts: [npmArtifact],
        fetch: malformedFetch,
        now: () => NOW,
      })
    ).rejects.toThrow('Malformed npm registry response');

    const transientFetch = (async () =>
      new Response('try again', { status: 503 })) as unknown as typeof fetch;
    await expect(
      reconcileRelease({
        manifest_id: MANIFEST_ID,
        packages: [pythonPackage],
        artifacts: [wheelArtifact, sdistArtifact],
        fetch: transientFetch,
        now: () => NOW,
      })
    ).rejects.toBeInstanceOf(RegistryTransientError);

    const networkFailure = (async () => {
      throw new TypeError('connection reset');
    }) as unknown as typeof fetch;
    await expect(
      reconcileRelease({
        manifest_id: MANIFEST_ID,
        packages: [npmPackage],
        artifacts: [npmArtifact],
        fetch: networkFailure,
        now: () => NOW,
      })
    ).rejects.toBeInstanceOf(RegistryTransientError);
  });
});

describe('immutable reconciliation plan and filtered artifact handoff', () => {
  test('supports partial registry states but freezes all writes on any conflict', async () => {
    const partial = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'exact', pypi: 'absent' }),
      now: () => NOW,
    });
    expect(partial.absent).toEqual({
      npm: [],
      pypi: [wheelArtifact.filename, sdistArtifact.filename],
    });
    const inverse = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'absent', pypi: 'exact' }),
      now: () => NOW,
    });
    expect(inverse.absent).toEqual({
      npm: [npmArtifact.filename],
      pypi: [],
    });

    const conflict = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'absent', pypi: 'conflict' }),
      now: () => NOW,
    });
    expect(conflict.can_publish).toBe(false);
    expect(conflict.absent).toEqual({ npm: [], pypi: [] });
    const conflictOutput = join(mkdtempSync(join(tmpdir(), 'sdk-release-conflict-')), 'filtered');
    expect(() =>
      filterAbsentArtifacts({
        plan: conflict,
        artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
        source_directory: 'unused-on-conflict',
        output_directory: conflictOutput,
      })
    ).toThrow('freezes every artifact handoff');
    expect(existsSync(conflictOutput)).toBe(false);
  });

  test('re-hashes only absent sealed files and leaves exact registries empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdk-release-reconcile-'));
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, npmArtifact.filename), npmBytes);
    writeFileSync(join(source, wheelArtifact.filename), pythonWheel);
    writeFileSync(join(source, sdistArtifact.filename), pythonSdist);

    const partial = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'exact', pypi: 'absent' }),
      now: () => NOW,
    });
    const output = filterAbsentArtifacts({
      plan: partial,
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      source_directory: source,
      output_directory: join(root, 'filtered'),
    });
    expect(output.npm).toEqual([]);
    expect(output.pypi.map(path => readFileSync(path).toString())).toEqual([
      'sealed python wheel',
      'sealed python sdist',
    ]);

    const exact = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage, pythonPackage],
      artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
      fetch: registryFetch({ npm: 'exact', pypi: 'exact' }),
      now: () => NOW,
    });
    expect(
      filterAbsentArtifacts({
        plan: exact,
        artifacts: [npmArtifact, wheelArtifact, sdistArtifact],
        source_directory: source,
        output_directory: join(root, 'empty'),
      })
    ).toEqual({ npm: [], pypi: [] });
  });

  test('rejects local artifact drift before handoff', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdk-release-drift-'));
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, npmArtifact.filename), 'changed bytes');
    const plan = await reconcileRelease({
      manifest_id: MANIFEST_ID,
      packages: [npmPackage],
      artifacts: [npmArtifact],
      fetch: registryFetch({ npm: 'absent' }),
      now: () => NOW,
    });
    expect(() =>
      filterAbsentArtifacts({
        plan,
        artifacts: [npmArtifact],
        source_directory: source,
        output_directory: join(root, 'filtered'),
      })
    ).toThrow('sealed digest mismatch');
  });
});

describe('bounded registry verification polling', () => {
  test('bounds never-settling registry requests inside the retry budget', async () => {
    let attempts = 0;
    const caller = new AbortController();
    const observedSignals: AbortSignal[] = [];
    const neverSettling = (async (_input, init) => {
      attempts += 1;
      const signal = init?.signal;
      if (!signal) throw new Error('expected a request abort signal');
      observedSignals.push(signal);
      return await new Promise<Response>((_, reject) => {
        const rejectOnAbort = () => reject(signal.reason);
        if (signal.aborted) rejectOnAbort();
        else signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
    }) as typeof fetch;

    await expect(
      verifyRegistryConsistency({
        reconcile: async () => {
          await fetchRegistry('npm', neverSettling, 'https://registry.npmjs.org/test', {
            signal: caller.signal,
            timeoutMs: 5,
          });
          throw new Error('timed-out registry request unexpectedly completed');
        },
        max_attempts: 2,
        initial_delay_ms: 0,
        maximum_delay_ms: 0,
        sleep: async () => undefined,
      })
    ).rejects.toBeInstanceOf(RegistryConsistencyTimeoutError);

    expect(attempts).toBe(2);
    expect(observedSignals).toHaveLength(2);
    expect(observedSignals.every(signal => signal.aborted)).toBe(true);
    expect(observedSignals.every(signal => signal !== caller.signal)).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  test('recovers from transient/absent observations and then returns exact', async () => {
    let attempt = 0;
    const delays: number[] = [];
    const result = await verifyRegistryConsistency({
      reconcile: async () => {
        attempt += 1;
        if (attempt === 1) throw new RegistryTransientError('npm', 503);
        return reconcileRelease({
          manifest_id: MANIFEST_ID,
          packages: [npmPackage],
          artifacts: [npmArtifact],
          fetch: registryFetch({ npm: attempt === 2 ? 'absent' : 'exact' }),
          now: () => NOW,
        });
      },
      max_attempts: 4,
      initial_delay_ms: 10,
      maximum_delay_ms: 15,
      sleep: async delay => {
        delays.push(delay);
      },
    });
    expect(result.observations[0]?.state).toBe('exact');
    expect(delays).toEqual([10, 15]);
  });

  test('returns conflict immediately and raises a distinct bounded timeout', async () => {
    const conflict = await verifyRegistryConsistency({
      reconcile: () =>
        reconcileRelease({
          manifest_id: MANIFEST_ID,
          packages: [npmPackage],
          artifacts: [npmArtifact],
          fetch: registryFetch({ npm: 'conflict' }),
          now: () => NOW,
        }),
      max_attempts: 3,
      sleep: async () => undefined,
    });
    expect(conflict.observations[0]?.state).toBe('conflict');

    await expect(
      verifyRegistryConsistency({
        reconcile: () =>
          reconcileRelease({
            manifest_id: MANIFEST_ID,
            packages: [npmPackage],
            artifacts: [npmArtifact],
            fetch: registryFetch({ npm: 'absent' }),
            now: () => NOW,
          }),
        max_attempts: 2,
        sleep: async () => undefined,
      })
    ).rejects.toBeInstanceOf(RegistryConsistencyTimeoutError);
  });

  test('mock registry URLs and fixtures contain no credentials', () => {
    const fixtureBytes = JSON.stringify([npmVersionDocument(), pypiDocument()]);
    expect(fixtureBytes).not.toMatch(/authorization|bearer|npm_token|pypi_password/i);
  });
});
