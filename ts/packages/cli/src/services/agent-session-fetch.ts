const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
const CREDENTIAL_HEADERS = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-user-api-key',
  'x-org-api-key',
  'x-org-id',
  'x-project-id',
];
const BODY_HEADERS = [
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-type',
];
const isAgentSessionHeader = (name: string) => name.startsWith('x-cli-agent-');

/** Fetch may forward custom headers across redirects. Follow those hops explicitly when a session is attached. */
export const fetchWithAgentSessionRedirects = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  if (init?.redirect === 'error' || init?.redirect === 'manual') return fetch(input, init);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  if (!Array.from(headers.keys()).some(isAgentSessionHeader)) return fetch(input, init);

  let url = new URL(input instanceof Request ? input.url : input);
  let requestInit: RequestInit = { ...init, redirect: 'manual' };
  let method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let body = init?.body ?? (input instanceof Request ? input.body : undefined);
  for (let hop = 0; ; hop++) {
    const response = await fetch(hop === 0 ? input : url.href, requestInit);
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;

    await response.body?.cancel().catch(() => undefined);
    if (hop === MAX_REDIRECTS) throw new TypeError('Too many redirects');
    const next = new URL(location, url);
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      throw new TypeError('The redirect must use HTTP or HTTPS');
    }
    if (next.username || next.password)
      throw new TypeError('The redirect URL contains credentials');

    if (next.origin !== url.origin) {
      for (const name of Array.from(headers.keys()).filter(isAgentSessionHeader))
        headers.delete(name);
      for (const name of CREDENTIAL_HEADERS) headers.delete(name);
    }

    // Match Fetch's method and body changes for redirects of replayable requests.
    if (
      ((response.status === 301 || response.status === 302) && method === 'POST') ||
      (response.status === 303 && method !== 'GET' && method !== 'HEAD')
    ) {
      method = 'GET';
      body = undefined;
      for (const name of BODY_HEADERS) headers.delete(name);
    } else if (body instanceof ReadableStream) {
      throw new TypeError('Cannot replay a streaming request body after a redirect');
    }
    url = next;
    requestInit = { ...requestInit, method, body, headers: new Headers(headers) };
  }
};
