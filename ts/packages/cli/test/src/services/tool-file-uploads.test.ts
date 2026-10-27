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
  readRunStagedFiles,
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

describe('readRunStagedFiles', () => {
  it.effect('loads original upload names and MIME types from the manifest', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-labels-'));
    const file = path.join(root, 'files.json');
    writeFileSync(
      file,
      JSON.stringify({
        '/tmp/file-1': { name: 'deck', mimetype: 'application/pdf' },
        '/tmp/file-2': { name: 'notes.txt' },
      })
    );
    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      expect(yield* readRunStagedFiles(fsApi, file)).toEqual(
        new Map([
          ['/tmp/file-1', { name: 'deck', mimetype: 'application/pdf' }],
          ['/tmp/file-2', { name: 'notes.txt' }],
        ])
      );
    }).pipe(
      Effect.provide(BunFileSystem.layer),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });

  it.effect.each(['not json', '["a"]', '{"/a":1}', '{"/a":{"mimetype":"text/plain"}}', undefined])(
    'rejects unreadable or invalid metadata (%s) instead of dropping labels',
    content => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'composio-labels-'));
      const file = path.join(root, 'files.json');
      if (content !== undefined) writeFileSync(file, content);
      return Effect.gen(function* () {
        const fsApi = yield* FileSystem.FileSystem;
        const failure = yield* Effect.flip(readRunStagedFiles(fsApi, file));
        expect(failure).toBeInstanceOf(ToolFileUploadError);
        expect(failure.reason).toBe('source-read');
      }).pipe(
        Effect.provide(BunFileSystem.layer),
        Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
      );
    }
  );
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
            mimetype: 'application/pdf',
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

describe('uploadToolInputFiles — MIME type of a local file (issue #4984)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const canvaSchema = {
    type: 'object',
    properties: {
      file: { file_uploadable: true, type: 'object' },
      title: { type: 'string' },
      mime_type: { type: 'string' },
    },
  };

  it.effect.each([
    { onDisk: 'deck.pptx', staged: undefined, name: 'deck.pptx', mimetype: PPTX },
    { onDisk: 'Deck.PPTX', staged: undefined, name: 'Deck.PPTX', mimetype: PPTX },
    {
      onDisk: 'no-extension',
      staged: undefined,
      name: 'no-extension',
      mimetype: 'application/octet-stream',
    },
    // What its caller staged it under (a `composio run` File's own name and type)
    // wins over the path's.
    { onDisk: 'file-a1', staged: { name: 'deck', mimetype: PPTX }, name: 'deck', mimetype: PPTX },
    {
      onDisk: 'file-a1.pdf',
      staged: { name: 'deck.pdf', mimetype: PPTX },
      name: 'deck.pdf',
      mimetype: PPTX,
    },
    { onDisk: 'file-a1.pptx', staged: { name: 'deck.pptx' }, name: 'deck.pptx', mimetype: PPTX },
    // Names the denylist refuses on a path are only labels here.
    {
      onDisk: 'file-a1.example',
      staged: { name: '.env.example', mimetype: 'text/plain' },
      name: '.env.example',
      mimetype: 'text/plain',
    },
    {
      onDisk: 'file-a1',
      staged: { name: 'id_rsa' },
      name: 'id_rsa',
      mimetype: 'application/octet-stream',
    },
  ])(
    '[Given] $onDisk staged as $staged [Then] the presign request, the PUT and the tool input carry $name and $mimetype',
    ({ onDisk, staged, name, mimetype }) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'composio-upload-'));
      const file = path.join(root, onDisk);
      writeFileSync(file, 'PK fake pptx');

      const { client, requests } = makeClient();
      const uploadFetch = vi.fn(async (_url: string, _init: RequestInit) => ({
        ok: true,
        statusText: 'OK',
      }));
      vi.stubGlobal('fetch', uploadFetch);

      return Effect.gen(function* () {
        const fsApi = yield* FileSystem.FileSystem;
        const pathApi = yield* Path.Path;
        const result = yield* uploadToolInputFiles({
          fs: fsApi,
          path: pathApi,
          toolSlug: 'CANVA_CREATE_DESIGN_IMPORT_JOB',
          arguments_: { file, title: 'Deck', mime_type: PPTX },
          inputSchema: canvaSchema,
          client,
          stagedFiles: new Map(staged === undefined ? [] : [[file, staged]]),
        });

        expect(requests).toMatchObject([
          { body: { filename: name, mimetype, toolkit_slug: 'canva' } },
        ]);
        expect(uploadFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
          'Content-Type': mimetype,
        });
        expect(result).toEqual({
          file: { name, mimetype, s3key: 's3key-123' },
          title: 'Deck',
          mime_type: PPTX,
        });
      }).pipe(
        Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
        Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
      );
    }
  );

  it.effect(
    '[Given] a sensitive path staged under a harmless name [Then] it is still refused',
    () =>
      Effect.gen(function* () {
        const fsApi = yield* FileSystem.FileSystem;
        const pathApi = yield* Path.Path;
        const { client, requests } = makeClient();
        const envFile = path.join(os.homedir(), '.env');

        // The staged-file labels rename an upload; they never exempt a path from the denylist.
        const failure = yield* Effect.flip(
          uploadToolInputFiles({
            fs: fsApi,
            path: pathApi,
            toolSlug: 'CANVA_CREATE_DESIGN_IMPORT_JOB',
            arguments_: { file: envFile, title: 'Deck' },
            inputSchema: canvaSchema,
            client,
            stagedFiles: new Map([[envFile, { name: 'deck.pptx', mimetype: PPTX }]]),
          })
        );

        expect(failure.cause).toBeInstanceOf(ComposioSensitiveFilePathBlockedError);
        expect(requests).toEqual([]);
      }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)))
  );
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
