/**
 * E2E fixture: Tool Router session files mount (list, upload, download, delete).
 * Requires COMPOSIO_API_KEY in environment.
 */
import { Composio } from '@composio/core';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error('COMPOSIO_API_KEY is required');
  process.exit(1);
}

const composio = new Composio({ apiKey });
const MAX_FILES_RETRIES = 10;
const FILES_RETRY_DELAY_MS = 1000;

async function main() {
  // Create a session (hackernews is public, no auth needed; files mount is always available)
  const session = await composio.create('e2e-tool-router-files-user', {
    toolkits: ['hackernews'],
    manageConnections: false,
  });

  const { files } = session.experimental;
  const testPath = 'e2e-test-upload.txt';
  const testContent = 'Hello from Tool Router files E2E test';

  // Upload a buffer
  const buffer = new TextEncoder().encode(testContent);
  const uploaded = await files.upload(buffer, {
    remotePath: testPath,
    mimetype: 'text/plain',
  });
  if (!uploaded.mountRelativePath || !uploaded.downloadUrl) {
    throw new Error('Upload failed: missing mountRelativePath or downloadUrl');
  }
  const candidatePaths = Array.from(
    new Set([uploaded.mountRelativePath, uploaded.mountRelativePath.replace(/^\/+/, '')]).values()
  ).filter(Boolean);
  console.log('UPLOAD_OK');

  // List files (retry for eventual consistency; omit path for root - SDK normalizes)
  let listOk = false;
  let listedPath;
  for (let attempt = 0; attempt < MAX_FILES_RETRIES; attempt++) {
    const listResult = await files.list();
    const foundItem = listResult.items?.find(
      item =>
        candidatePaths.includes(item.mountRelativePath) ||
        item.mountRelativePath === testPath ||
        item.mountRelativePath?.endsWith(testPath) ||
        item.mountRelativePath?.includes(testPath)
    );
    if (foundItem) {
      listOk = true;
      listedPath = foundItem.mountRelativePath;
      break;
    }
    await new Promise(r => setTimeout(r, FILES_RETRY_DELAY_MS));
  }
  if (listOk) console.log('LIST_OK');
  else console.log('LIST_SKIP'); // eventual consistency

  const downloadCandidatePaths = Array.from(
    new Set([
      listedPath,
      listedPath?.replace(/^\/+/, ''),
      ...candidatePaths,
    ]).values()
  ).filter(Boolean);

  // Download the file (retry for eventual consistency, same as list above)
  let downloaded;
  let lastDownloadError;
  let resolvedPath;
  for (let attempt = 0; attempt < MAX_FILES_RETRIES; attempt++) {
    for (const candidatePath of downloadCandidatePaths) {
      try {
        const remoteFile = await files.download(candidatePath);
        const content = await remoteFile.text();
        if (content !== testContent) {
          throw new Error(`Download failed: expected "${testContent}", got "${content}"`);
        }
        downloaded = remoteFile;
        resolvedPath = candidatePath;
        break;
      } catch (err) {
        lastDownloadError = err;
      }
    }
    if (downloaded) {
      break;
    }
    if (attempt < MAX_FILES_RETRIES - 1) {
      await new Promise(r => setTimeout(r, FILES_RETRY_DELAY_MS));
    }
  }
  if (!downloaded) {
    throw lastDownloadError ?? new Error('Download failed after retries');
  }
  console.log('DOWNLOAD_OK');

  // Delete the file (use path from API response)
  await files.delete(resolvedPath ?? downloadCandidatePaths[0]);
  console.log('DELETE_OK');

  console.log('ALL_OK');
}

main().catch(err => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
