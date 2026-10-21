import { afterEach, describe, expect, it, vi } from '@effect/vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Effect, Fiber, Layer } from 'effect';
import { HttpClient } from 'effect/http';
import { Auth, BadRequestError, make } from '@composio/client/effect';
import {
  ComposioBlockedInternalUrlError,
  ComposioSensitiveFilePathBlockedError,
  MAX_URL_UPLOAD_SIZE_BYTES,
} from '@composio/core';
import {
  findLocalPathArguments,
  schemaHasFileUploadable,
  ToolFileUploadError,
  uploadToolInputFiles,
} from 'src/services/tool-file-uploads';
import { stubComposioClient } from 'test/__utils__/services/stub-composio-client';

// Schema with a single `file_uploadable` attachment field — mirrors tools like
// GMAIL_SEND_EMAIL whose attachment is uploaded from a local path.
const inputSchema = {
  type: 'object',
  properties: {
    attachment: { file_uploadable: true, type: 'string' },
  },
};

// The client over a transport that answers the presigned-URL request with
// `presigned`, and records each request it receives.
const makeClient = (
  presigned: { readonly new_presigned_url: string; readonly key: string } = {
    new_presigned_url: 'https://1.1.1.1/put',
    key: 's3key-123',
  }
) => stubComposioClient(() => Response.json(presigned));

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
      const { client, requests } = makeClient();

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
          inputSchema,
          client,
        })
      );

      expect(failure).toBeInstanceOf(ToolFileUploadError);
      expect(failure).toMatchObject({ reason: 'source-read' });
      expect(failure.cause).toBeInstanceOf(ComposioSensitiveFilePathBlockedError);
      // The guard must fire BEFORE any network round-trip: no presigned URL, no upload.
      expect(requests).toEqual([]);
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect(
    'surfaces CLI-appropriate remediation, not the SDK-only opt-out, in the block error',
    () =>
      Effect.gen(function* () {
        const fsApi = yield* FileSystem.FileSystem;
        const pathApi = yield* Path.Path;
        const { client } = makeClient();

        // The CLI has no `sensitiveFileUploadProtection` opt-out (by design), so the
        // error must not point users at that non-existent knob (issue #3763 review #2/#3).
        const failure = yield* Effect.flip(
          uploadToolInputFiles({
            fs: fsApi,
            path: pathApi,
            toolSlug: 'GMAIL_SEND_EMAIL',
            arguments_: { attachment: path.join(os.homedir(), '.ssh', 'id_rsa') },
            inputSchema,
            client,
          })
        );

        expect(failure.message).toMatch(/has no opt-out/i);
        expect(failure.message).not.toMatch(/sensitiveFileUploadProtection/);
      }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect('refuses credential-like basenames (.env) even outside a sensitive directory', () =>
    Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const { client, requests } = makeClient();

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: path.join(os.tmpdir(), '.env') },
          inputSchema,
          client,
        })
      );

      expect(failure.cause).toBeInstanceOf(ComposioSensitiveFilePathBlockedError);
      expect(requests).toEqual([]);
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect('requests one presigned URL for a normal local file and uploads to it', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    const file = path.join(root, 'document.pdf');
    writeFileSync(file, 'hello');

    const { client, requests } = makeClient();
    const uploadFetch = vi.fn(async () => ({ ok: true, statusText: 'OK' }));
    vi.stubGlobal('fetch', uploadFetch);

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const result = yield* uploadToolInputFiles({
        fs: fsApi,
        path: pathApi,
        toolSlug: 'GMAIL_SEND_EMAIL',
        arguments_: { attachment: file },
        inputSchema,
        client,
      });

      expect(requests).toEqual([
        {
          method: 'POST',
          path: '/api/v3.1/files/upload/request',
          body: {
            filename: 'document.pdf',
            mimetype: 'application/octet-stream',
            md5: '5d41402abc4b2a76b9719d911017c592',
            tool_slug: 'GMAIL_SEND_EMAIL',
            toolkit_slug: 'gmail',
          },
        },
      ]);
      expect(uploadFetch).toHaveBeenCalledTimes(1);
      expect(uploadFetch).toHaveBeenCalledWith(
        'https://1.1.1.1/put',
        expect.objectContaining({ method: 'PUT' })
      );
      expect(result.attachment).toMatchObject({ s3key: 's3key-123', name: 'document.pdf' });
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });
});

describe('uploadToolInputFiles — presigned-URL request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.effect('fails with the API failure, worded as before, when the request is refused', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    const file = path.join(root, 'document.pdf');
    writeFileSync(file, 'hello');
    const body = {
      error: { message: 'Unsupported mimetype', code: 1803, slug: 'File_Invalid', status: 400 },
    };
    const { client, requests } = stubComposioClient(() => Response.json(body, { status: 400 }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: file },
          inputSchema,
          client,
        })
      );

      expect(failure).toBeInstanceOf(BadRequestError);
      expect(failure).toMatchObject({
        message: `400 ${JSON.stringify(body)}`,
        status: 400,
        details: body.error,
      });
      expect(requests).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });

  it.effect('interrupting the caller interrupts the request', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    const file = path.join(root, 'document.pdf');
    writeFileSync(file, 'hello');
    // A transport that never answers, reporting when the request reaches it
    // and when it is interrupted.
    const reached = Promise.withResolvers<void>();
    let interrupted = false;
    const client = make(
      {
        auth: Auth.project('test'),
        baseURL: 'https://stub.invalid',
      },
      HttpClient.make(() =>
        Effect.sync(() => reached.resolve()).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true;
            })
          )
        )
      )
    );

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;

      const fiber = yield* Effect.forkChild(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: file },
          inputSchema,
          client,
        })
      );
      yield* Effect.promise(() => reached.promise);
      yield* Fiber.interrupt(fiber);

      expect(interrupted).toBe(true);
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });
});

describe('uploadToolInputFiles — URL SSRF boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.effect('rejects an unsafe source before requesting an upload destination', () =>
    Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const { client, requests } = makeClient();
      const sourceUrl = 'http://169.254.169.254/latest/meta-data/credentials';

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: sourceUrl },
          inputSchema,
          client,
        })
      );

      expect(failure.cause).toBeInstanceOf(ComposioBlockedInternalUrlError);
      expect(requests).toEqual([]);
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );

  it.effect('rejects an unsafe presigned destination before sending file bytes', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    const file = path.join(root, 'document.pdf');
    writeFileSync(file, 'hello');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { client, requests } = makeClient({
      new_presigned_url: 'http://127.0.0.1:8080/upload',
      key: 's3key-123',
    });

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: file },
          inputSchema,
          client,
        })
      );

      expect(failure.cause).toBeInstanceOf(ComposioBlockedInternalUrlError);
      expect(requests).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });
});

describe('uploadToolInputFiles — URL download size cap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.effect('rejects a remote file that declares a body above the cap before buffering it', () => {
    const { client, requests } = makeClient();
    const oversized = String(MAX_URL_UPLOAD_SIZE_BYTES + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('not the real body', {
            status: 200,
            headers: { 'content-length': oversized, 'content-type': 'application/octet-stream' },
          })
      )
    );

    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;

      const failure = yield* Effect.flip(
        uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'GMAIL_SEND_EMAIL',
          arguments_: { attachment: 'https://1.1.1.1/large.bin' },
          inputSchema,
          client,
        })
      );

      expect(failure.message).toMatch(/exceeds maximum allowed size/);
      expect(requests).toEqual([]);
    }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)));
  });
});

// TRELLO_ADD_CARDS_ATTACHMENTS_BY_ID_CARD as the API serves it (issue #4965):
// `file` is described as a local file but is not `file_uploadable`.
const trelloAttachmentSchema = {
  type: 'object',
  required: ['idCard'],
  properties: {
    idCard: { type: 'string', description: 'ID or shortLink of the Trello card.' },
    url: {
      type: 'string',
      description:
        "URL of an external resource to attach if not uploading a `file`. Must start with 'http://' or 'https://'.",
    },
    file: {
      type: 'string',
      title: 'File',
      description: 'Path to the local file to attach if not linking a `url`.',
    },
  },
};

describe('uploadToolInputFiles — local file for an input that is not file_uploadable (issue #4965)', () => {
  const withTempFile = <A, E, R>(
    use: (paths: { readonly root: string; readonly file: string }) => Effect.Effect<A, E, R>
  ) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
    const file = path.join(root, 'photo.jpg');
    writeFileSync(file, 'jpeg bytes');
    return use({ root, file }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  };

  const run = (arguments_: Record<string, unknown>, schema: Record<string, unknown>) =>
    Effect.gen(function* () {
      const { client, requests } = makeClient();
      const result = yield* uploadToolInputFiles({
        fs: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        toolSlug: 'TRELLO_ADD_CARDS_ATTACHMENTS_BY_ID_CARD',
        arguments_,
        inputSchema: schema,
        client,
      }).pipe(Effect.result);
      return { result, requests };
    });

  it.effect('fails before anything is sent when the argument names a local file', () =>
    withTempFile(({ file }) =>
      Effect.gen(function* () {
        const { result, requests } = yield* run({ idCard: 'card', file }, trelloAttachmentSchema);

        const failure = yield* Effect.flip(Effect.fromResult(result));
        expect(failure).toBeInstanceOf(ToolFileUploadError);
        expect(failure).toMatchObject({ reason: 'not-uploadable' });
        expect(failure.message).toContain(`"file" (${file})`);
        expect(failure.message).toContain('Nothing was executed');
        expect(requests).toEqual([]);
      })
    )
  );

  it.effect('names every offending argument, including ones nested in arrays', () =>
    withTempFile(({ file }) =>
      Effect.gen(function* () {
        const { result } = yield* run(
          { files: [{ file_path: file }, { content: 'inline' }] },
          {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file_path: {
                      type: 'string',
                      description: 'Local filesystem path to the file.',
                    },
                    content: { type: 'string' },
                  },
                },
              },
            },
          }
        );

        const failure = yield* Effect.flip(Effect.fromResult(result));
        expect(failure.message).toContain(`"files.0.file_path" (${file})`);
      })
    )
  );

  it.effect('passes a path that does not exist here through, as it may be remote', () =>
    withTempFile(({ root }) =>
      Effect.gen(function* () {
        const remote = path.join(root, 'missing', 'report.pdf');
        const { result, requests } = yield* run(
          { idCard: 'card', file: remote },
          trelloAttachmentSchema
        );

        expect(yield* Effect.fromResult(result)).toEqual({ idCard: 'card', file: remote });
        expect(requests).toEqual([]);
      })
    )
  );

  it.effect.each([
    { name: 'a directory', value: (root: string) => root },
    { name: 'a URL', value: () => 'https://example.com/photo.jpg' },
    { name: 'a bare word', value: () => 'photo' },
  ])('passes $name through', ({ value }) =>
    withTempFile(({ root }) =>
      Effect.gen(function* () {
        const file = value(root);
        const { result } = yield* run({ idCard: 'card', file }, trelloAttachmentSchema);
        expect(yield* Effect.fromResult(result)).toEqual({ idCard: 'card', file });
      })
    )
  );

  it.effect('leaves an existing file alone when the input is a repository path', () =>
    withTempFile(({ file }) =>
      Effect.gen(function* () {
        const { result } = yield* run(
          { path: file },
          {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The full path to the file in the repository, including the filename.',
              },
            },
          }
        );

        expect(yield* Effect.fromResult(result)).toEqual({ path: file });
      })
    )
  );

  it('reads the description of an optional input from its non-null variant', () => {
    expect(
      findLocalPathArguments(
        { file: '/tmp/photo.jpg' },
        {
          type: 'object',
          properties: {
            file: {
              anyOf: [
                { type: 'string', description: 'Local file path of the video to upload.' },
                { type: 'null' },
              ],
            },
          },
        }
      )
    ).toEqual([{ argumentPath: ['file'], value: '/tmp/photo.jpg' }]);
  });

  it('skips an input that also accepts an upload', () => {
    expect(
      findLocalPathArguments(
        { file: '/tmp/photo.jpg' },
        {
          type: 'object',
          properties: {
            file: {
              description: 'Path to the local file to upload.',
              anyOf: [{ file_uploadable: true }, { type: 'string' }],
            },
          },
        }
      )
    ).toEqual([]);
  });
});
