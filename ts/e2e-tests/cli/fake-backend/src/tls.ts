/**
 * A throwaway certificate for the fake Dashboard.
 *
 * The CLI sends a user API key to the Dashboard only over `https:` (or to
 * loopback), so a fake the container reaches by host name has to speak TLS.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TlsMaterial {
  readonly key: string;
  readonly cert: string;
}

/** Host names the binary under test may reach the fake by. */
export const FAKE_HOSTNAMES = ['host.docker.internal', 'localhost'] as const;

let cached: TlsMaterial | undefined;

/** Self-signed, generated once per test process with the host's `openssl`. */
export const tlsMaterial = (): TlsMaterial => {
  if (cached) return cached;
  const directory = mkdtempSync(join(tmpdir(), 'composio-e2e-tls-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        `/CN=${FAKE_HOSTNAMES[0]}`,
        '-addext',
        `subjectAltName=${FAKE_HOSTNAMES.map(name => `DNS:${name}`).join(',')},IP:127.0.0.1`,
      ],
      { stdio: 'pipe' }
    );
    cached = { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
    return cached;
  } catch (cause) {
    throw new Error('The fake Dashboard needs `openssl` on PATH to create its test certificate.', {
      cause,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
