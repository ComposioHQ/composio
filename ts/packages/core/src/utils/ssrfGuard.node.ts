import { lookup } from 'node:dns/promises'; // we're in a Node.js-specific module
import { isIP } from 'node:net';
import { ComposioBlockedInternalUrlError } from '../errors/SsrfErrors';

/**
 * SSRF guard for user-supplied URL file inputs.
 *
 * `composio.files.upload(url)` and automatic file upload during tool execution
 * fetch arbitrary user-provided URLs. Without a guard, a caller (or a tool
 * argument produced by an LLM) can point the SDK at internal infrastructure —
 * loopback, RFC1918 ranges, link-local cloud-metadata endpoints
 * (`169.254.169.254`), or a public URL that 3xx-redirects into internal space —
 * turning the SDK into a server-side request forgery probe.
 *
 * This module validates the *resolved* address (not just the hostname string,
 * which defeats decimal/octal/hex IP obfuscation) before every fetch, and
 * follows redirects manually so each hop is re-validated.
 *
 * Known residual: a DNS name could resolve to a public address here and rebind
 * to an internal one before the underlying `fetch` connects (a TOCTOU / DNS
 * rebinding window). Closing that fully requires pinning the validated IP at
 * connect time (a custom dispatcher), which is out of scope for this guard.
 */

const MAX_REDIRECTS = 5;

const ipv4ToLong = (ip: string): number => {
  const [a, b, c, d] = ip.split('.').map(Number);
  return (((a << 24) >>> 0) | (b << 16) | (c << 8) | d) >>> 0;
};

// Address blocks that must never be reachable from a user-supplied URL.
// (RFC1918 private, loopback, link-local, CGNAT, TEST-NET, benchmarking,
// multicast, and reserved ranges.)
const IPV4_BLOCKED_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this" network / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (incl. 255.255.255.255 broadcast)
];

const isBlockedIpv4Long = (long: number): boolean =>
  IPV4_BLOCKED_CIDRS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (long & mask) === (ipv4ToLong(base) & mask);
  });

/**
 * Expand an IPv6 string into its 8 16-bit groups, converting any trailing
 * dotted-quad (e.g. `::ffff:1.2.3.4`) into hex groups first. Returns `null` when
 * the input cannot be parsed.
 */
const expandIpv6 = (ip: string): number[] | null => {
  let addr = ip;
  const v4Match = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    const long = ipv4ToLong(v4Match[2]);
    addr = `${v4Match[1]}${((long >>> 16) & 0xffff).toString(16)}:${(long & 0xffff).toString(16)}`;
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) return null;
  return groups.map(g => parseInt(g || '0', 16));
};

const isBlockedIpv6 = (ip: string): boolean => {
  const h = expandIpv6(ip);
  if (!h) return true; // fail closed on anything we cannot parse

  // ::  (unspecified) and ::1 (loopback)
  if (h.every(x => x === 0)) return true;
  if (h.slice(0, 7).every(x => x === 0) && h[7] === 1) return true;

  // Addresses that embed an IPv4 address in their low 32 bits must be validated
  // against the IPv4 blocklist, otherwise `::127.0.0.1` / `::169.254.169.254`
  // (and mapped/NAT64 forms) would pass as "public" IPv6 and reach internal
  // targets. Covers:
  //   - IPv4-mapped     ::ffff:0:0/96  (h[5] === 0xffff)
  //   - IPv4-compatible ::/96          (deprecated, h[5] === 0) — incl. ::a.b.c.d
  //   - NAT64           64:ff9b::/96
  const highBitsZero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;
  const isMappedOrCompat = highBitsZero && (h[5] === 0xffff || h[5] === 0);
  const isNat64 =
    h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0;
  if (isMappedOrCompat || isNat64) {
    return isBlockedIpv4Long((((h[6] << 16) >>> 0) | h[7]) >>> 0);
  }

  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8

  return false;
};

/**
 * True when `ip` is a private, loopback, link-local, or otherwise
 * non-publicly-routable address. Fails closed (returns `true`) for anything that
 * is not a valid IPv4/IPv6 literal.
 */
export const isBlockedIp = (ip: string): boolean => {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4Long(ipv4ToLong(ip));
  if (family === 6) return isBlockedIpv6(ip);
  return true;
};

/**
 * Validate a single URL: it must be http(s), its host must resolve, and every
 * resolved address must be publicly routable. Throws
 * {@link ComposioBlockedInternalUrlError} otherwise.
 */
export const assertSafeFetchTarget = async (rawUrl: string): Promise<void> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ComposioBlockedInternalUrlError('Refusing to fetch a malformed URL', { url: rawUrl });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ComposioBlockedInternalUrlError(
      `Refusing to fetch a non-http(s) URL (scheme "${url.protocol}")`,
      { url: rawUrl }
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ComposioBlockedInternalUrlError(`Could not resolve host "${host}"`, { url: rawUrl });
  }

  for (const { address } of resolved) {
    if (isBlockedIp(address)) {
      throw new ComposioBlockedInternalUrlError(
        `Refusing to fetch "${host}" — it resolves to a private, loopback, or link-local address`,
        { url: rawUrl, resolvedIp: address }
      );
    }
  }
};

/**
 * Drop-in replacement for `fetch` that blocks SSRF. Validates the target before
 * connecting and re-validates every redirect hop (redirects are followed
 * manually up to {@link MAX_REDIRECTS}). Non-redirect responses are returned
 * unchanged.
 */
export const ssrfSafeFetch = async (
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects: number = MAX_REDIRECTS
): Promise<Response> => {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeFetchTarget(currentUrl);

    const response = await fetch(currentUrl, { ...init, redirect: 'manual' });

    const isRedirect =
      response.status >= 300 && response.status < 400 && response.headers.has('location');
    if (!isRedirect) {
      return response;
    }

    currentUrl = new URL(response.headers.get('location')!, currentUrl).toString();
  }

  throw new ComposioBlockedInternalUrlError(
    `Refusing to fetch: too many redirects (max ${maxRedirects})`,
    { url: rawUrl }
  );
};
