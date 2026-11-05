import { describe, expect, test } from 'bun:test';
import { verifyPypiProvenance } from '../scripts/sdk-release/provenance';
import { verifyPypiFiles, type Distribution } from '../scripts/sdk-release/registry';
import { runRelease, type Fetch } from './sdk-release-harness';

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
const noWait = { attempts: 2, spacing: '0 millis' } as const;

/** PyPI's integrity and version metadata endpoints for one wheel, with `publisher` attesting it. */
const pypi =
  (publisher: Record<string, string> | undefined): Fetch =>
  async input => {
    const url = String(input);
    if (url === `https://pypi.org/integrity/composio/0.31.1b8/${wheel.file}/provenance`)
      return publisher
        ? Response.json({ version: 1, attestation_bundles: [{ publisher, attestations: [] }] })
        : new Response('{}', { status: 404 });
    if (url === 'https://pypi.org/pypi/composio/0.31.1b8/json')
      return Response.json({
        urls: [{ filename: wheel.file, url: fileUrl, digests: { sha256: '' } }],
      });
    throw new Error(`Unexpected PyPI request: ${url}`);
  };

describe('PyPI attestations', () => {
  test('a file attested by the release workflow in pypi-release is accepted', async () => {
    await runRelease(verifyPypiProvenance(wheel, noWait), pypi(releasePublisher));
  });

  test.each([
    ['another repository', { repository: 'someone/composio' }],
    ['another workflow', { workflow: 'py.release.yml' }],
    ['another environment', { environment: 'pypi' }],
  ])('a file attested by %s is refused', async (_name, change) => {
    await expect(
      runRelease(verifyPypiProvenance(wheel, noWait), pypi({ ...releasePublisher, ...change }))
    ).rejects.toThrow('is not attested by ComposioHQ/composio sdk.release.yml in pypi-release');
  });

  test('a file without provenance is refused once the wait runs out', async () => {
    await expect(runRelease(verifyPypiProvenance(wheel, noWait), pypi(undefined))).rejects.toThrow(
      'No provenance is published at https://pypi.org/integrity/composio'
    );
  });

  test('verified files return the URLs PyPI serves, for the signature check', async () => {
    expect(await runRelease(verifyPypiFiles([wheel], noWait), pypi(releasePublisher))).toEqual([
      fileUrl,
    ]);
  });
});
