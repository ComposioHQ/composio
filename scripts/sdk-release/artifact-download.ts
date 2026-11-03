import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { SDK_RELEASE_REPOSITORY } from './github';
import { verifyArchive } from './artifacts';
import { runPreparationCommand } from './commands';

export async function downloadCandidate(
  token: string,
  artifact: { id: number; digest: string },
  directory: string
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${SDK_RELEASE_REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
    {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      redirect: 'manual',
    }
  );
  if (response.status !== 302) throw new Error(`Artifact download failed (${response.status})`);
  const url = new URL(z.string().parse(response.headers.get('location')));
  if (url.protocol !== 'https:') throw new Error('Expected an HTTPS artifact archive');
  const archive = await fetch(url, { redirect: 'error' });
  if (!archive.ok) throw new Error('Original artifact is unavailable');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  verifyArchive(bytes, artifact.digest);
  const zip = `${directory}.zip`;
  await writeFile(zip, bytes);
  const paths = runPreparationCommand('unzip', ['-Z1', zip], process.cwd()).trim().split('\n');
  if (
    new Set(paths).size !== paths.length ||
    paths.some(path => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path))
  )
    throw new Error('Unexpected artifact archive path');
  await mkdir(directory, { recursive: true });
  runPreparationCommand('unzip', ['-q', zip, '-d', directory], process.cwd());
}
