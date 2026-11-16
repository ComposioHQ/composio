import { describe, expect, test } from 'bun:test';
import { verifyPypiProvenance } from '../scripts/sdk-release/provenance';
import { verifyPypiFiles, type Distribution } from '../scripts/sdk-release/registry';
import { runOnTestClock, type Fetch } from './sdk-release-harness';

const wheel: Distribution = {
  language: 'python',
  name: 'composio',
  version: '0.31.1b8',
  file: 'composio-0.31.1b8-py3-none-any.whl',
  bytes: new Uint8Array(),
  sha256: '',
};
const fileUrl = 'https://files.pythonhosted.org/packages/ab/cd/composio-0.31.1b8-py3-none-any.whl';
const releasePublisher = {
  kind: 'GitHub',
  repository: 'ComposioHQ/composio',
  workflow: 'sdk.release.yml',
  environment: 'pypi-release',
};

/**
 * PyPI's integrity and version metadata endpoints for one wheel, with `publisher` attesting it.
 * The provenance endpoint first answers each of `before`, then serves the attestation.
 */
const pypi =
  (publisher: Record<string, string> | undefined, before: ReadonlyArray<number> = []) =>
  (): Fetch => {
    const pending = [...before];
    return async input => {
      const url = String(input);
      if (url === `https://pypi.org/integrity/composio/0.31.1b8/${wheel.file}/provenance`) {
        const status = pending.shift();
        if (status !== undefined) return new Response('{}', { status });
        return publisher
          ? Response.json({ version: 1, attestation_bundles: [{ publisher, attestations: [] }] })
          : new Response('{}', { status: 404 });
      }
      if (url === 'https://pypi.org/pypi/composio/0.31.1b8/json')
        return Response.json({
          urls: [{ filename: wheel.file, url: fileUrl, digests: { sha256: '' } }],
        });
      throw new Error(`Unexpected PyPI request: ${url}`);
    };
  };

describe('PyPI attestations', () => {
  test('a file attested by the release workflow in pypi-release is accepted', async () => {
    await runOnTestClock(verifyPypiProvenance(wheel), pypi(releasePublisher));
  });

  test.each([
    ['404 for 10 polls', Array.from({ length: 10 }, () => 404)],
    ['429', [429]],
  ])('provenance that answers %s and is then present is accepted', async (_name, before) => {
    await runOnTestClock(verifyPypiProvenance(wheel), pypi(releasePublisher, before));
  });

  test('a provenance lookup that stalls is retried, then accepted', async () => {
    let stalled = false;
    const stallOnce = (): Fetch => {
      const served = pypi(releasePublisher)();
      return async (input, init) => {
        if (!stalled && String(input).endsWith('/provenance')) {
          stalled = true;
          return new Promise<Response>(() => {});
        }
        return served(input, init);
      };
    };
    await runOnTestClock(verifyPypiProvenance(wheel), stallOnce);
    expect(stalled).toBe(true);
  });

  test.each([
    ['another repository', { repository: 'someone/composio' }],
    ['another workflow', { workflow: 'py.release.yml' }],
    ['another environment', { environment: 'pypi' }],
  ])('a file attested by %s is refused', async (_name, change) => {
    await expect(
      runOnTestClock(verifyPypiProvenance(wheel), pypi({ ...releasePublisher, ...change }))
    ).rejects.toThrow('is not attested by ComposioHQ/composio sdk.release.yml in pypi-release');
  });

  test('a file without provenance is refused once the wait runs out', async () => {
    await expect(runOnTestClock(verifyPypiProvenance(wheel), pypi(undefined))).rejects.toThrow(
      'No provenance is published at https://pypi.org/integrity/composio'
    );
  });

  test('verified files return the URLs PyPI serves, for the signature check', async () => {
    expect(await runOnTestClock(verifyPypiFiles([wheel]), pypi(releasePublisher))).toEqual([
      fileUrl,
    ]);
  });
});
