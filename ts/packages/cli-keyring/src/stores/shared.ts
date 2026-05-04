/**
 * Subprocess plumbing shared by the macOS and Linux stores.
 *
 * Both stores shell out to OS-provided CLIs (`/usr/bin/security` and
 * `secret-tool`) via `node:child_process`. Keeping the spawn helper
 * here means the backends only have to deal with argv construction
 * and exit-code mapping — not stream buffering.
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

export interface SpawnResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface SpawnInput {
  readonly command: string;
  readonly args: readonly string[];
  /**
   * Raw bytes to write to stdin before closing it. Used by the Linux
   * store to pipe passwords into `secret-tool store` without putting
   * them on argv.
   */
  readonly stdin?: Uint8Array;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Concatenate an array of Uint8Arrays without going through Buffer.
 */
function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Spawn a subprocess and return all output buffered. Resolves once
 * the process exits; never rejects — errors from failed spawns (e.g.
 * ENOENT when `secret-tool` isn't installed) surface as a rejected
 * promise with the original `Error`, which callers convert into a
 * `KeyringError({ kind: 'NoStorageAccess' })` or similar.
 */
export function runCommand(input: SpawnInput): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const options: SpawnOptionsWithoutStdio = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: input.env,
    };
    let child;
    try {
      child = spawn(input.command, [...input.args], options);
    } catch (err) {
      reject(err);
      return;
    }

    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    child.stdout.on('data', (chunk: Uint8Array) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array) => stderrChunks.push(chunk));

    child.once('error', err => reject(err));
    child.once('close', (code, signal) => {
      resolve({
        code,
        signal,
        stdout: concatBytes(stdoutChunks),
        stderr: concatBytes(stderrChunks),
      });
    });

    if (input.stdin !== undefined) {
      child.stdin.end(input.stdin);
    } else {
      child.stdin.end();
    }
  });
}

/** Decode a byte slice as UTF-8. */
export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/** Encode a JS string as UTF-8 bytes. */
export function utf8ToBytes(s: string): Uint8Array {
  return textEncoder.encode(s);
}

/**
 * Universal on-disk encoding for stored secrets. We base64-encode
 * every secret before handing it to `security` / `secret-tool` because:
 *
 * 1. `security -w` takes the password on argv and cannot carry binary
 *    bytes (NUL bytes truncate; newlines break parsing).
 * 2. `secret-tool store` reads one line from stdin via
 *    `g_io_channel_read_line`, which can't carry NUL bytes or embedded
 *    newlines either.
 *
 * The tradeoff is that credentials written by this package are NOT
 * readable by other tools that share the same keychain namespace —
 * they'll see `<base64 blob>` instead of the original value. For the
 * CLI's use case (our own API key) that's fine, and the prefix tag
 * keeps us honest about what we're doing.
 */
const STORAGE_PREFIX = 'b64:';

/**
 * Encode bytes to base64 via `btoa` on a binary latin-1 string —
 * avoids `Buffer` and works in every runtime that provides the HTML5
 * `btoa` global (Node 16+, Bun, browsers).
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode raw bytes into the on-disk format. */
export function encodeSecret(secret: Uint8Array): string {
  return STORAGE_PREFIX + bytesToBase64(secret);
}

/**
 * Decode the on-disk format back into raw bytes. Throws a plain
 * `Error` on malformed input; callers wrap it in
 * `KeyringError({ kind: 'BadDataFormat' })`.
 */
export function decodeSecret(stored: string): Uint8Array {
  const trimmed = stored.replace(/\n$/, '');
  if (!trimmed.startsWith(STORAGE_PREFIX)) {
    throw new Error(`expected keyring value to start with "${STORAGE_PREFIX}" prefix`);
  }
  const encoded = trimmed.slice(STORAGE_PREFIX.length);
  // Strict validation — `atob` is lenient and malformed blobs would
  // silently decode to truncated garbage otherwise.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('keyring value contains non-base64 characters');
  }
  return base64ToBytes(encoded);
}
