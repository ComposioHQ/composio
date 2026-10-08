import { after } from 'next/server';
import type {
  KnowledgeDegradationReason,
  KnowledgeFilter,
  KnowledgeRetrievalMode,
} from './search';
import type { KnowledgeSourceType } from './types';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_EVENT_NAME = 'kb_search_executed';
const POSTHOG_DISTINCT_ID = 'public-kb-search';

export interface KnowledgeSearchAnalyticsEvent {
  query: string;
  filter: KnowledgeFilter;
  retrievalMode: KnowledgeRetrievalMode | 'unavailable';
  resultCount: number;
  degradationCategory: KnowledgeDegradationReason | 'all-retrievers-failed' | null;
  strongMatch: boolean | null;
  statusCode: number;
  durationMs: number;
  keywordDurationMs: number;
  semanticDurationMs: number | null;
  resultSourceTypes: KnowledgeSourceType[];
  previewOverlayApplied: boolean;
}

export interface PostHogCaptureConfig {
  apiKey?: string;
  host?: string;
  timeoutMs?: number;
}

interface PostHogCapture {
  url: string;
  body: Record<string, unknown>;
}

const CREDENTIAL_FIELD = [
  '(?:x[_-])?api[_ -]?key',
  'refresh[_ -]?token',
  'access[_ -]?token',
  'client[_ -]?secret',
  'authorization',
  'password',
  'secret',
  'token',
].join('|');
const REDACTABLE_CREDENTIAL_VALUE =
  `(?!\\[REDACTED\\])(?:"[^"]*"|'[^']*'|[^&\\s,}\\]]+)`;
const CREDENTIAL_ASSIGNMENT = new RegExp(
  `(^|[?&#\\s,{])(["']?)(${CREDENTIAL_FIELD})\\2(\\s*[:=]\\s*)` +
    REDACTABLE_CREDENTIAL_VALUE,
  'gi',
);
const AUTHORIZATION_SCHEME_ASSIGNMENT = new RegExp(
  `(^|[?&#\\s,{])(["']?)(authorization)\\2(\\s*[:=]\\s*)` +
    `(?:Bearer|Basic)\\s+[^&\\s,}\\]]+`,
  'gi',
);
const OAUTH_QUERY_ASSIGNMENT = new RegExp(
  `(^|[?&#])(["']?)(code|state)\\2(\\s*=\\s*)${REDACTABLE_CREDENTIAL_VALUE}`,
  'gi',
);
const STRUCTURED_OAUTH_ASSIGNMENT = new RegExp(
  `(^|[,{]\\s*)(["']?)(code|state)\\2(\\s*:\\s*)${REDACTABLE_CREDENTIAL_VALUE}`,
  'gi',
);

function redactStructuredOAuthAssignments(query: string): string {
  if (!query.startsWith('{') && !query.startsWith('[')) return query;
  return query.replace(
    STRUCTURED_OAUTH_ASSIGNMENT,
    (_match, prefix, quote, field, separator) =>
      `${prefix}${quote}${field}${quote}${separator}[REDACTED]`,
  );
}

export function redactKnowledgeSearchQuery(query: string): string {
  const redacted = query
    .trim()
    .slice(0, 200)
    .replace(AUTHORIZATION_SCHEME_ASSIGNMENT, (_match, prefix, quote, field, separator) =>
      `${prefix}${quote}${field}${quote}${separator}[REDACTED]`)
    .replace(CREDENTIAL_ASSIGNMENT, (_match, prefix, quote, field, separator) =>
      `${prefix}${quote}${field}${quote}${separator}[REDACTED]`)
    .replace(OAUTH_QUERY_ASSIGNMENT, (_match, prefix, quote, field, separator) =>
      `${prefix}${quote}${field}${quote}${separator}[REDACTED]`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:ak|ck|phc)_[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]');
  return redactStructuredOAuthAssignments(redacted);
}

export function buildKnowledgeSearchCapture(
  event: KnowledgeSearchAnalyticsEvent,
  config: PostHogCaptureConfig,
): PostHogCapture | null {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;

  const host = (config.host?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '');
  return {
    url: `${host}/i/v0/e/`,
    body: {
      api_key: apiKey,
      event: POSTHOG_EVENT_NAME,
      properties: {
        distinct_id: POSTHOG_DISTINCT_ID,
        '$process_person_profile': false,
        query: redactKnowledgeSearchQuery(event.query),
        filter: event.filter,
        retrieval_mode: event.retrievalMode,
        result_count: event.resultCount,
        degradation_category: event.degradationCategory,
        strong_match: event.strongMatch,
        status_code: event.statusCode,
        duration_ms: Math.round(event.durationMs),
        keyword_duration_ms: Math.round(event.keywordDurationMs),
        semantic_duration_ms: event.semanticDurationMs === null
          ? null
          : Math.round(event.semanticDurationMs),
        result_source_types: event.resultSourceTypes,
        preview_overlay_applied: event.previewOverlayApplied,
      },
    },
  };
}

export async function sendKnowledgeSearchAnalytics(
  event: KnowledgeSearchAnalyticsEvent,
  config: PostHogCaptureConfig,
): Promise<boolean> {
  const capture = buildKnowledgeSearchCapture(event, config);
  if (!capture) return false;

  try {
    const response = await fetch(capture.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capture.body),
      signal: AbortSignal.timeout(config.timeoutMs ?? 1_500),
    });
    if (!response.ok) {
      console.warn('[kb-search]', JSON.stringify({
        event: 'kb_search_analytics_delivery_failed',
        statusCode: response.status,
      }));
    }
    return response.ok;
  } catch {
    // Analytics must never affect search availability or latency.
    console.warn('[kb-search]', JSON.stringify({
      event: 'kb_search_analytics_delivery_failed',
      statusCode: null,
    }));
    return false;
  }
}

export function queueKnowledgeSearchAnalytics(event: KnowledgeSearchAnalyticsEvent): void {
  after(() => sendKnowledgeSearchAnalytics(event, {
    apiKey: process.env.POSTHOG_PROJECT_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY,
    host: process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST,
  }));
}
