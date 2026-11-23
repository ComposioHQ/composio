import { QUESTIONS, type JevAnswers, type SdkAreaChoice } from './route.ts';

export const JEV_MODEL = 'jev-1.13.0';
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const NOUL_KEYS = [
  'account_specific',
  'hosted_problem',
  'sdk_code',
  'new_toolkit',
  'is_bug',
  'missing_details',
  'feature_request',
] as const;
const SDK_AREA_KEYS: readonly SdkAreaChoice[] = ['ts', 'py', 'cli', 'docs', 'none'];

export type JevOptions = {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;
};

function assertProbability(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid Jev probability for ${label}`);
  }
  return value;
}

export async function classifyWithJev(
  issue: { readonly title: string; readonly body: string },
  options: JevOptions
): Promise<JevAnswers> {
  if (!options.apiKey) {
    throw new Error('TYPESAFE_API_KEY is not configured');
  }
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  let response: Response;
  try {
    response = await fetchFn(JEV_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: { issue: { title: issue.title || '', body: issue.body || '' } },
        questions: QUESTIONS,
        model: JEV_MODEL,
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`Jev API request timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw new Error('Jev API network request failed', { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Jev API request failed with HTTP ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error(`Jev API returned invalid JSON (HTTP ${response.status})`, { cause: error });
  }

  const rawAnswers = (json as { answers?: Record<string, unknown> } | null)?.answers;
  if (!rawAnswers || typeof rawAnswers !== 'object') {
    throw new Error('Jev API response missing answers');
  }

  const noulValues = {} as Record<(typeof NOUL_KEYS)[number], number>;
  for (const key of NOUL_KEYS) {
    const entry = rawAnswers[key] as { noul?: unknown } | undefined;
    noulValues[key] = assertProbability(entry?.noul, key);
  }

  const rawChoice = rawAnswers.sdk_area as { probabilities?: Record<string, unknown> } | undefined;
  const rawProbs = rawChoice?.probabilities;
  if (!rawProbs || typeof rawProbs !== 'object') {
    throw new Error('Jev API response missing sdk_area probabilities');
  }

  const sdkArea = {} as Record<SdkAreaChoice, number>;
  for (const option of SDK_AREA_KEYS) {
    sdkArea[option] = assertProbability(rawProbs[option], `sdk_area.${option}`);
  }

  return { ...noulValues, sdk_area: sdkArea };
}
