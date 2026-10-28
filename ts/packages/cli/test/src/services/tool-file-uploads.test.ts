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
  findFileUploadablePaths,
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

  const optionalModeSchema = (required: ReadonlyArray<string>) => ({
    type: 'object',
    allOf: [
      {
        properties: { mode: { const: 'upload' }, file: { file_uploadable: true } },
        required,
      },
    ],
  });

  it('keeps a branch whose optional const property the caller omitted', () => {
    expect(findFileUploadablePaths(optionalModeSchema(['file']), [], {})).toEqual([['file']]);
  });

  it('drops a branch whose const property is required and omitted, or set to another value', () => {
    expect(findFileUploadablePaths(optionalModeSchema(['mode', 'file']), [], {})).toEqual([]);
    expect(findFileUploadablePaths(optionalModeSchema(['file']), [], { mode: 'link' })).toEqual([]);
  });
});

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
    // A file the caller did not stage takes the type of its extension.
    { onDisk: 'deck.pptx', staged: undefined, name: 'deck.pptx', mimetype: PPTX },
    { onDisk: 'Deck.PPTX', staged: undefined, name: 'Deck.PPTX', mimetype: PPTX },
    { onDisk: 'picture.png', staged: undefined, name: 'picture.png', mimetype: 'image/png' },
    { onDisk: 'picture.JPG', staged: undefined, name: 'picture.JPG', mimetype: 'image/jpeg' },
    {
      onDisk: 'document.pdf',
      staged: undefined,
      name: 'document.pdf',
      mimetype: 'application/pdf',
    },
    {
      onDisk: 'document.docx',
      staged: undefined,
      name: 'document.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      onDisk: 'unknown.extension-dogfood',
      staged: undefined,
      name: 'unknown.extension-dogfood',
      mimetype: 'application/octet-stream',
    },
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

  const localPathDescription = { type: 'string', description: 'Path to the local file to attach.' };

  it.each([
    {
      name: 'allOf splits the description and the upload marker across branches',
      schema: {
        type: 'object',
        allOf: [
          { properties: { file: localPathDescription } },
          { properties: { file: { file_uploadable: true } } },
        ],
      },
    },
    {
      name: 'anyOf offers an uploadable branch beside the path branch',
      schema: {
        type: 'object',
        properties: { file: { anyOf: [localPathDescription, { file_uploadable: true }] } },
      },
    },
    {
      name: 'oneOf nests the uploadable branch one level down',
      schema: {
        type: 'object',
        properties: {
          file: { oneOf: [localPathDescription, { allOf: [{ file_uploadable: true }] }] },
        },
      },
    },
  ])('never flags an input the upload code uploads: $name', ({ schema }) => {
    expect(findLocalPathArguments({ file: '/tmp/photo.jpg' }, schema)).toEqual([]);
  });

  it.effect('uploads, not refuses, a local file for an allOf-split uploadable input', () =>
    withTempFile(({ file }) =>
      Effect.gen(function* () {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => ({ ok: true, statusText: 'OK' }))
        );
        const { result, requests } = yield* run(
          { file },
          {
            type: 'object',
            allOf: [
              { properties: { file: localPathDescription } },
              { properties: { file: { file_uploadable: true } } },
            ],
          }
        );

        expect(yield* Effect.fromResult(result)).toMatchObject({
          file: { name: 'photo.jpg', s3key: 's3key-123' },
        });
        expect(requests).toHaveLength(1);
      }).pipe(Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals())))
    )
  );

  it.effect('uploads an input once when several branches mark it uploadable', () =>
    withTempFile(({ file }) =>
      Effect.gen(function* () {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => ({ ok: true, statusText: 'OK' }))
        );
        const { result, requests } = yield* run(
          { file, note: 'keep' },
          {
            type: 'object',
            anyOf: [
              { properties: { file: { file_uploadable: true } } },
              { properties: { file: { file_uploadable: true }, note: { type: 'string' } } },
            ],
          }
        );

        expect(yield* Effect.fromResult(result)).toEqual({
          file: { name: 'photo.jpg', mimetype: 'image/jpeg', s3key: 's3key-123' },
          note: 'keep',
        });
        expect(requests).toHaveLength(1);
      }).pipe(Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals())))
    )
  );

  it('flags only the tuple elements the upload code does not upload', () => {
    // `hydrateFileUploads` reads each tuple element against its own `items` schema.
    expect(
      findLocalPathArguments(
        { files: ['/tmp/photo.jpg', '/tmp/other.jpg'] },
        {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: [localPathDescription, { ...localPathDescription, file_uploadable: true }],
            },
          },
        }
      )
    ).toEqual([{ argumentPath: ['files', 0], value: '/tmp/photo.jpg' }]);
  });

  it('reads descriptions in nested composition branches', () => {
    expect(
      findLocalPathArguments(
        { file: '/tmp/photo.jpg' },
        {
          type: 'object',
          properties: {
            file: { anyOf: [{ type: 'null' }, { allOf: [localPathDescription] }] },
          },
        }
      )
    ).toEqual([{ argumentPath: ['file'], value: '/tmp/photo.jpg' }]);
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
