import { createHash } from 'node:crypto';

export const DEFAULT_SEMANTIC_TIMEOUT_MS = 3_000;
export const DEFAULT_SEMANTIC_REQUESTS_PER_MINUTE = 60;
export const DEFAULT_SEMANTIC_GLOBAL_REQUESTS_PER_MINUTE = 600;
export const DEFAULT_SEMANTIC_MAX_CONCURRENCY = 8;

export interface SemanticSearchLease {
  allowed: true;
  release: () => void;
}

export interface SemanticSearchDenied {
  allowed: false;
  reason: 'semantic-rate-limited' | 'semantic-capacity-limited';
}

export type SemanticSearchAdmission = SemanticSearchLease | SemanticSearchDenied;

interface ClientWindow {
  count: number;
  startedAt: number;
}

interface SemanticSearchBudgetOptions {
  requestsPerWindow: number;
  globalRequestsPerWindow?: number;
  windowMs: number;
  maxConcurrent: number;
  now?: () => number;
}

const MAX_TRACKED_CLIENTS = 5_000;

export class SemanticSearchBudget {
  private readonly clients = new Map<string, ClientWindow>();
  private readonly now: () => number;
  private globalWindow: ClientWindow = { count: 0, startedAt: 0 };
  private active = 0;

  constructor(private readonly options: SemanticSearchBudgetOptions) {
    this.now = options.now ?? Date.now;
  }

  tryAcquire(clientKey?: string): SemanticSearchAdmission {
    if (this.active >= this.options.maxConcurrent) {
      return { allowed: false, reason: 'semantic-capacity-limited' };
    }

    const now = this.now();
    const globalLimit = this.options.globalRequestsPerWindow ?? Number.POSITIVE_INFINITY;
    const globalWindow = now - this.globalWindow.startedAt >= this.options.windowMs
      ? { count: 0, startedAt: now }
      : this.globalWindow;
    if (globalWindow.count >= globalLimit) {
      return { allowed: false, reason: 'semantic-rate-limited' };
    }

    if (clientKey) {
      const existing = this.clients.get(clientKey);
      const client = !existing || now - existing.startedAt >= this.options.windowMs
        ? { count: 0, startedAt: now }
        : existing;
      if (client.count >= this.options.requestsPerWindow) {
        return { allowed: false, reason: 'semantic-rate-limited' };
      }
      client.count += 1;
      if (!existing && this.clients.size >= MAX_TRACKED_CLIENTS) {
        const oldestKey = this.clients.keys().next().value;
        if (oldestKey) this.clients.delete(oldestKey);
      }
      this.clients.set(clientKey, client);
    }

    globalWindow.count += 1;
    this.globalWindow = globalWindow;
    this.active += 1;
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
      },
    };
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function semanticSearchClientKey(request: Request): string | undefined {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    ?? request.headers.get('x-forwarded-for');
  const clientAddress = forwarded?.split(',', 1)[0]?.trim();
  if (!clientAddress) return undefined;
  return createHash('sha256').update(clientAddress, 'utf8').digest('hex').slice(0, 32);
}

const requestsPerMinute = boundedInteger(
  process.env.KB_SEMANTIC_REQUESTS_PER_MINUTE,
  DEFAULT_SEMANTIC_REQUESTS_PER_MINUTE,
  1,
  1_000,
);
const globalRequestsPerMinute = boundedInteger(
  process.env.KB_SEMANTIC_GLOBAL_REQUESTS_PER_MINUTE,
  DEFAULT_SEMANTIC_GLOBAL_REQUESTS_PER_MINUTE,
  1,
  10_000,
);
const maxConcurrency = boundedInteger(
  process.env.KB_SEMANTIC_MAX_CONCURRENCY,
  DEFAULT_SEMANTIC_MAX_CONCURRENCY,
  1,
  100,
);
const defaultBudget = new SemanticSearchBudget({
  requestsPerWindow: requestsPerMinute,
  globalRequestsPerWindow: globalRequestsPerMinute,
  windowMs: 60_000,
  maxConcurrent: maxConcurrency,
});

export function acquireDefaultSemanticSearch(request: Request): SemanticSearchAdmission {
  return defaultBudget.tryAcquire(semanticSearchClientKey(request));
}

export function defaultSemanticTimeoutMs(): number {
  return boundedInteger(
    process.env.KB_SEMANTIC_TIMEOUT_MS,
    DEFAULT_SEMANTIC_TIMEOUT_MS,
    250,
    10_000,
  );
}
