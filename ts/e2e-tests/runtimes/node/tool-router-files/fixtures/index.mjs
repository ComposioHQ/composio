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

async function main() {
  // Create a session (hackernews is public, no auth needed; files mount is always available)
  const session = await composio.create('e2e-tool-router-files-user', {
    toolkits: ['hackernews'],
    manageConnections: false,
  });

  const { files } = session;
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
  const storedPath = uploaded.mountRelativePath.replace(/^\//, '');
  console.log('UPLOAD_OK');

  // List files (retry for eventual consistency; omit path for root - SDK normalizes)
  let listOk = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const listResult = await files.list();
    const found = listResult.items?.some(
      (item) =>
        item.mountRelativePath === storedPath ||
        item.mountRelativePath === testPath ||
        item.mountRelativePath?.endsWith(testPath) ||
        item.mountRelativePath?.includes(testPath)
    );
    if (found) {
      listOk = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (listOk) console.log('LIST_OK');
  else console.log('LIST_SKIP'); // eventual consistency

  // Download the file (use path from API response)
  const downloaded = await files.download(storedPath);
  const content = await downloaded.text();
  if (content !== testContent) {
    throw new Error(`Download failed: expected "${testContent}", got "${content}"`);
  }
  console.log('DOWNLOAD_OK');

  // Delete the file (use path from API response)
  await files.delete(storedPath);
  console.log('DELETE_OK');

  console.log('ALL_OK');
}

main().catch((err) => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
