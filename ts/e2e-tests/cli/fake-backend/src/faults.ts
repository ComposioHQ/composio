/**
 * Fault injection: a fault replaces or distorts the answer of one route.
 *
 * A fault is addressed to a route name (`toolRouter.session.execute`) or to a
 * `METHOD /path` pattern, and applies to the next `times` matching requests.
 */

export type Fault =
  /** Answer with this status and the standard error envelope (or `body`). */
  | {
      readonly kind: 'status';
      readonly status: number;
      readonly slug?: string;
      readonly message?: string;
      readonly code?: number;
      readonly headers?: Readonly<Record<string, string>>;
      readonly body?: unknown;
    }
  /** Hold the answer back for `ms` before sending it unchanged. */
  | { readonly kind: 'delay'; readonly ms: number }
  /** Send the headers and the first bytes of the body, then drop the connection. */
  | { readonly kind: 'reset-mid-body' }
  /** Accept the request and drop the connection without answering. */
  | { readonly kind: 'reset' }
  /** 200 with a body that is not JSON. */
  | { readonly kind: 'malformed-json' }
  /** 200 with valid JSON whose shape the CLI does not expect. */
  | { readonly kind: 'schema-drift'; readonly transform: (body: unknown) => unknown }
  /** An HTML page, as a proxy or captive portal would answer. */
  | { readonly kind: 'html'; readonly status?: number }
  /** 200 with an empty body. */
  | { readonly kind: 'empty-body' };

export interface FaultTarget {
  /** A route name, or a pattern tested against `METHOD /path`. */
  readonly route: string | RegExp;
  readonly fault: Fault;
  /** How many matching requests the fault applies to. Defaults to every one. */
  readonly times?: number;
}

interface ArmedFault {
  readonly target: FaultTarget;
  remaining: number;
}

export class FaultController {
  private armed: ArmedFault[] = [];

  /** Arms a fault and returns a function that disarms it. */
  inject(target: FaultTarget): () => void {
    const entry: ArmedFault = { target, remaining: target.times ?? Number.POSITIVE_INFINITY };
    this.armed.push(entry);
    return () => {
      this.armed = this.armed.filter(candidate => candidate !== entry);
    };
  }

  clear(): void {
    this.armed = [];
  }

  /** The fault for this request, consuming one of its uses. */
  take(route: string | null, method: string, path: string): Fault | undefined {
    const line = `${method} ${path}`;
    const match = this.armed.find(({ target, remaining }) => {
      if (remaining <= 0) return false;
      return typeof target.route === 'string' ? target.route === route : target.route.test(line);
    });
    if (!match) return undefined;
    match.remaining -= 1;
    return match.target.fault;
  }
}

export const describeFault = (fault: Fault): string =>
  fault.kind === 'status' ? `status:${fault.status}` : fault.kind;

/** Fixed, so an error path prints the same request id on every run. */
export const FAULT_REQUEST_ID = 'req_e2e_fault_0001';

export const errorEnvelope = (params: {
  status: number;
  message: string;
  slug: string;
  code?: number;
  suggestedFix?: string;
}) => ({
  error: {
    message: params.message,
    code: params.code ?? params.status,
    slug: params.slug,
    status: params.status,
    request_id: FAULT_REQUEST_ID,
    suggested_fix: params.suggestedFix ?? '',
  },
});

export const HTML_ERROR_PAGE =
  '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head>' +
  '<body><h1>502 Bad Gateway</h1><p>The upstream server is unreachable.</p></body></html>\n';

/** A body no JSON parser accepts: a response cut off inside a string. */
export const MALFORMED_JSON_BODY = '{"items": [{"slug": "trunc';
