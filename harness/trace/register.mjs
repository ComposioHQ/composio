// Harness-owned fetch tracer. Injected via NODE_OPTIONS=--import; examples
// must never reference COMPOSIO_TRACE_FILE themselves (lint-enforced).
import { resolveBackendBaseUrl } from '../backend-url.mjs';

const traceFile = process.env.COMPOSIO_TRACE_FILE;

if (traceFile) {
  const { appendFileSync } = await import('node:fs');

  const LLM_HOSTS = new Set([
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
  ]);

  const backendHost = new URL(resolveBackendBaseUrl()).hostname;

  const ID_SEG =
    /^(ca_|ac_|ti_|tr_|trs_|sess_|auth_|req_|proj_|org_)[\w-]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\d+$/i;
  const template = (path) =>
    path
      .split('/')
      .map((seg) => (ID_SEG.test(seg) ? '{id}' : seg))
      .join('/');

  const record = (obj) => {
    try {
      appendFileSync(traceFile, `${JSON.stringify(obj)}\n`);
    } catch {
      // never break the example over tracing
    }
  };

  // Outbound-email guard: tool executions matching the denylist are refused at
  // the transport, never forwarded to the backend.
  const DENY = new RegExp(process.env.COMPOSIO_TOOL_DENYLIST ?? 'GMAIL_SEND|GMAIL_REPLY|SEND_EMAIL|SEND_DRAFT|OUTLOOK[A-Z_]*SEND', 'i');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async function tracedFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    } catch {
      return origFetch.call(this, input, init);
    }
    const method = (
      init?.method ??
      (typeof input === 'object' && input !== null && 'method' in input ? input.method : 'GET') ??
      'GET'
    ).toUpperCase();

    if (url.hostname === backendHost && DENY.test(url.pathname)) {
      record({ m: method, p: template(url.pathname), s: 'BLOCKED' });
      throw new Error(`harness: outbound-email tool execution blocked (${url.pathname})`);
    }

    let res;
    try {
      res = await origFetch.call(this, input, init);
      return res;
    } finally {
      if (url.hostname === backendHost) {
        record({
          m: method,
          p: template(url.pathname),
          s: res ? `${Math.floor(res.status / 100)}xx` : 'ERR',
        });
      } else if (LLM_HOSTS.has(url.hostname)) {
        record({ llm: url.hostname });
      }
    }
  };
}
