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
  findFileUploadablePaths,
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

describe('file argument paths', () => {
  const schema = {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          oneOf: [
            {
              properties: { type: { const: 'add_image' }, image: { file_uploadable: true } },
              required: ['type'],
            },
            {
              properties: { type: { const: 'replace_image' }, image: { file_uploadable: true } },
              required: ['type'],
            },
            {
              properties: { type: { const: 'set_text' }, text: { type: 'string' } },
              required: ['type'],
            },
          ],
        },
      },
    },
  };

  it('binds the selected union branch to the existing array index', () => {
    expect(
      findFileUploadablePaths(schema, [], {
        operations: [{ type: 'set_text', text: 'keep' }, { type: 'add_image' }],
      })
    ).toEqual([['operations', 1, 'image']]);
  });

  it('does not invent array entries or choose between multiple image operations', () => {
    expect(findFileUploadablePaths(schema, [], { operations: [] })).toEqual([]);
    expect(findFileUploadablePaths(schema, [], { operations: [{ type: 'set_text' }] })).toEqual([]);
    expect(
      findFileUploadablePaths(schema, [], {
        operations: [{ type: 'add_image' }, { type: 'replace_image' }],
      })
    ).toEqual([
      ['operations', 0, 'image'],
      ['operations', 1, 'image'],
    ]);
  });

  it('preserves tuple indices, including preceding boolean schemas', () => {
    expect(
      findFileUploadablePaths(
        { type: 'array', items: [true, { file_uploadable: true }] },
        [],
        ['keep', undefined]
      )
    ).toEqual([[1]]);
  });
});

describe('local file MIME metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.effect.each([
    { filename: 'picture.png', expectedMime: 'image/png' },
    { filename: 'picture.JPG', expectedMime: 'image/jpeg' },
    { filename: 'document.pdf', expectedMime: 'application/pdf' },
    {
      filename: 'slides.pptx',
      expectedMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    {
      filename: 'document.docx',
      expectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    { filename: 'unknown.extension-dogfood', expectedMime: 'application/octet-stream' },
    { filename: 'no-extension', expectedMime: 'application/octet-stream' },
  ])(
    'uses the same MIME for the request, upload, and hydrated $filename',
    ({ filename, expectedMime }) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'composio-mime-'));
      const file = path.join(root, filename);
      writeFileSync(file, 'fixture bytes');
      const { client, requests } = makeClient();
      const uploadFetch = vi.fn(async () => new Response(null, { status: 200 }));
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
        expect(requests[0]?.body).toMatchObject({ mimetype: expectedMime });
        expect(uploadFetch).toHaveBeenCalledWith(
          'https://1.1.1.1/put',
          expect.objectContaining({
            headers: expect.objectContaining({ 'Content-Type': expectedMime }),
          })
        );
        expect(result.attachment).toMatchObject({ name: filename, mimetype: expectedMime });
      }).pipe(
        Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
        Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
      );
    }
  );
});

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

describe('multiple PowerPoint images', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.effect('keeps each nested image reference paired with its uploaded bytes', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-multiple-images-'));
    const first = path.join(root, 'first.png');
    const second = path.join(root, 'second.png');
    writeFileSync(first, 'first image bytes');
    writeFileSync(second, 'second image bytes');
    const { client, requests } = stubComposioClient(request => {
      const { filename } = request.body as { filename: string };
      return Response.json({
        new_presigned_url: `https://1.1.1.1/${filename}`,
        key: `uploads/${filename}`,
      });
    });
    const uploaded = new Map<string, string>();
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      uploaded.set(url, Buffer.from(init.body as Uint8Array).toString());
      return new Response(null, { status: 200 });
    });
    const schema = {
      type: 'object',
      properties: {
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              blocks: {
                type: 'array',
                items: {
                  oneOf: [
                    { properties: { type: { const: 'text' }, text: { type: 'string' } } },
                    { properties: { type: { const: 'image' }, image: { file_uploadable: true } } },
                  ],
                },
              },
            },
          },
        },
      },
    };
    const arguments_ = {
      filename: 'two-images.pptx',
      slides: [
        {
          blocks: [
            { type: 'text', text: 'Keep this' },
            { type: 'image', image: first },
          ],
        },
        { blocks: [{ type: 'image', image: second }] },
      ],
    };
    return Effect.gen(function* () {
      const fsApi = yield* FileSystem.FileSystem;
      const pathApi = yield* Path.Path;
      const result = yield* uploadToolInputFiles({
        fs: fsApi,
        path: pathApi,
        toolSlug: 'MICROSOFT_POWERPOINT_CREATE_PRESENTATION',
        arguments_,
        inputSchema: schema,
        client,
      });
      expect(requests).toHaveLength(2);
      expect(uploaded).toEqual(
        new Map([
          ['https://1.1.1.1/first.png', 'first image bytes'],
          ['https://1.1.1.1/second.png', 'second image bytes'],
        ])
      );
      expect(result).toEqual({
        filename: 'two-images.pptx',
        slides: [
          {
            blocks: [
              { type: 'text', text: 'Keep this' },
              {
                type: 'image',
                image: {
                  name: 'first.png',
                  mimetype: 'image/png',
                  s3key: 'uploads/first.png',
                },
              },
            ],
          },
          {
            blocks: [
              {
                type: 'image',
                image: {
                  name: 'second.png',
                  mimetype: 'image/png',
                  s3key: 'uploads/second.png',
                },
              },
            ],
          },
        ],
      });
      expect(arguments_.slides[0]?.blocks[1]?.image).toBe(first);
      expect(arguments_.slides[1]?.blocks[0]?.image).toBe(second);
    }).pipe(
      Effect.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true })))
    );
  });
});
