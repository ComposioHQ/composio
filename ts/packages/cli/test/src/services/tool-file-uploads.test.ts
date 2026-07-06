import { afterEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Composio as RawComposioClient } from '@composio/client';
import { ComposioSensitiveFilePathBlockedError } from '@composio/core';
import { uploadToolInputFiles } from 'src/services/tool-file-uploads';

// Schema with a single `file_uploadable` attachment field — mirrors tools like
// GMAIL_SEND_EMAIL whose attachment is uploaded from a local path.
const inputSchema = {
  type: 'object',
  properties: {
    attachment: { file_uploadable: true, type: 'string' },
  },
};

const makeClient = (createPresignedURL = vi.fn()) =>
  ({ files: { createPresignedURL } }) as unknown as RawComposioClient;

describe('uploadToolInputFiles — sensitive-path guard (issue #3746)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses to read/upload a path under a sensitive directory (~/.ssh/id_rsa)', async () => {
    const createPresignedURL = vi.fn();
    const client = makeClient(createPresignedURL);

    await expect(
      uploadToolInputFiles({
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
        inputSchema,
        client,
      })
    ).rejects.toBeInstanceOf(ComposioSensitiveFilePathBlockedError);

    // The guard must fire BEFORE any network round-trip: no presigned URL, no upload.
    expect(createPresignedURL).not.toHaveBeenCalled();
  });

  it('surfaces CLI-appropriate remediation, not the SDK-only opt-out, in the block error', async () => {
    const client = makeClient(vi.fn());

    // The CLI has no `sensitiveFileUploadProtection` opt-out (by design), so the
    // error must not point users at that non-existent knob (issue #3763 review #2/#3).
    await expect(
      uploadToolInputFiles({
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
        inputSchema,
        client,
      })
    ).rejects.toThrowError(/has no opt-out/i);

    await expect(
      uploadToolInputFiles({
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
        inputSchema,
        client,
      })
    ).rejects.not.toThrowError(/sensitiveFileUploadProtection/);
  });

  it('refuses credential-like basenames (.env) even outside a sensitive directory', async () => {
    const createPresignedURL = vi.fn();
    const client = makeClient(createPresignedURL);

    await expect(
      uploadToolInputFiles({
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: path.join(os.tmpdir(), '.env') },
        inputSchema,
        client,
      })
    ).rejects.toBeInstanceOf(ComposioSensitiveFilePathBlockedError);
    expect(createPresignedURL).not.toHaveBeenCalled();
  });

  it('still uploads a normal (non-sensitive) local file', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    try {
      const file = path.join(root, 'document.pdf');
      writeFileSync(file, 'hello');

      const createPresignedURL = vi.fn(async () => ({
        new_presigned_url: 'https://s3.example.com/put',
        key: 's3key-123',
      }));
      const client = makeClient(createPresignedURL);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, statusText: 'OK' }))
      );

      const result = await uploadToolInputFiles({
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: file },
        inputSchema,
        client,
      });

      expect(createPresignedURL).toHaveBeenCalledTimes(1);
      expect(result.attachment).toMatchObject({ s3key: 's3key-123', name: 'document.pdf' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
