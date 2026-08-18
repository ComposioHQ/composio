import { afterEach, describe, expect, it, vi } from '@effect/vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { Composio as RawComposioClient } from '@composio/client';
import { ComposioSensitiveFilePathBlockedError } from '@composio/core';
import { schemaHasFileUploadable, uploadToolInputFiles } from 'src/services/tool-file-uploads';

// Schema with a single `file_uploadable` attachment field — mirrors tools like
// GMAIL_SEND_EMAIL whose attachment is uploaded from a local path.
const inputSchema = {
  type: 'object',
  properties: {
    attachment: { file_uploadable: true, type: 'string' },
  },
};

const makeClient = (createPresignedURL = vi.fn()) =>
  Object.assign(new RawComposioClient({ apiKey: 'test' }), {
    files: { createPresignedURL },
  });

describe('uploadToolInputFiles — sensitive-path guard (issue #3746)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores malformed composition branches without hiding valid schemas', () => {
    expect(
      schemaHasFileUploadable({
        anyOf: ['not-a-schema', null, { file_uploadable: true }],
      })
    ).toBe(true);
    expect(schemaHasFileUploadable({ anyOf: ['not-a-schema', null] })).toBe(false);
  });

  it.effect('refuses to read/upload a path under a sensitive directory (~/.ssh/id_rsa)', () =>
    Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const createPresignedURL = vi.fn();
      const client = makeClient(createPresignedURL);

      yield* Effect.promise(() =>
        expect(
          uploadToolInputFiles({
            fs: fsApi,
            path: pathApi,
            toolSlug: 'GMAIL_SEND_EMAIL',
            arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
            inputSchema,
            client,
          })
        ).rejects.toBeInstanceOf(ComposioSensitiveFilePathBlockedError)
      );

      // The guard must fire BEFORE any network round-trip: no presigned URL, no upload.
      expect(createPresignedURL).not.toHaveBeenCalled();
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect(
    'surfaces CLI-appropriate remediation, not the SDK-only opt-out, in the block error',
    () =>
      Effect.gen(function* () {
        const fsApi = yield* FileSystem.FileSystem;
        const pathApi = yield* Path.Path;
        const client = makeClient(vi.fn());

        // The CLI has no `sensitiveFileUploadProtection` opt-out (by design), so the
        // error must not point users at that non-existent knob (issue #3763 review #2/#3).
        yield* Effect.promise(() =>
          expect(
            uploadToolInputFiles({
              fs: fsApi,
              path: pathApi,
              toolSlug: 'GMAIL_SEND_EMAIL',
              arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
              inputSchema,
              client,
            })
          ).rejects.toThrowError(/has no opt-out/i)
        );

        yield* Effect.promise(() =>
          expect(
            uploadToolInputFiles({
              fs: fsApi,
              path: pathApi,
              toolSlug: 'GMAIL_SEND_EMAIL',
              arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
              inputSchema,
              client,
            })
          ).rejects.not.toThrowError(/sensitiveFileUploadProtection/)
        );
      }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect('refuses credential-like basenames (.env) even outside a sensitive directory', () =>
    Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const createPresignedURL = vi.fn();
      const client = makeClient(createPresignedURL);

      yield* Effect.promise(() =>
        expect(
          uploadToolInputFiles({
            fs: fsApi,
            path: pathApi,
            toolSlug: 'GMAIL_SEND_EMAIL',
            arguments_: { attachment: path.join(os.tmpdir(), '.env') },
            inputSchema,
            client,
          })
        ).rejects.toBeInstanceOf(ComposioSensitiveFilePathBlockedError)
      );
      expect(createPresignedURL).not.toHaveBeenCalled();
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect('still uploads a normal (non-sensitive) local file', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
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

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const result = yield* Effect.promise(() =>
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: file },
          inputSchema,
          client,
        })
      );

      expect(createPresignedURL).toHaveBeenCalledTimes(1);
      expect(createPresignedURL).toHaveBeenCalledWith(
        expect.objectContaining({ md5: '5d41402abc4b2a76b9719d911017c592' })
      );
      expect(result.attachment).toMatchObject({ s3key: 's3key-123', name: 'document.pdf' });
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });
});
