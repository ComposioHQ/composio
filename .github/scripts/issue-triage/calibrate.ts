import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { classifyWithJev } from './jev.ts';
import { THRESHOLDS, route, type JevAnswers, type Thresholds } from './route.ts';

type RawIssue = { number: number; title: string; body: string; labels: string[]; created_at: string };
export type ScoredIssue = RawIssue & { answers: JevAnswers };

const SINCE = '2026-04-01T00:00:00Z';
const SDK_LABELS = new Set(['ts', 'py', 'cli', 'docs']);
const LABELS_PATH = new URL('./calibration-labels.json', import.meta.url);

function fetchIssues(): RawIssue[] {
  const out = execFileSync(
    'gh',
    [
      'api',
      '--paginate',
      `repos/ComposioHQ/composio/issues?state=all&since=${SINCE}&per_page=100`,
      '--jq',
      `.[] | select(.pull_request == null and (.created_at >= "${SINCE}")) | {number, created_at, title, body: (.body // ""), labels: [.labels[].name]}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as RawIssue);
}

async function scoreIssues(issues: RawIssue[], apiKey: string): Promise<ScoredIssue[]> {
  const queue = [...issues];
  const scored: ScoredIssue[] = [];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length > 0) {
        const issue = queue.shift()!;
        const answers = await classifyWithJev({ title: issue.title, body: issue.body }, { apiKey });
        scored.push({ ...issue, answers });
      }
    })
  );
  return scored.sort((a, b) => a.number - b.number);
}

// Support precision is measured only against SDK-labeled, non-support issues (the `sdk && !isSup` cohort).
// Bug, feature-request, and tool-request labels feed other checks and do not establish support negatives.
export function evaluate(scored: ScoredIssue[], kinds: Record<string, 'account' | 'hosted'>, thresholds: Thresholds) {
  let tp = 0, fp = 0, fn = 0, sdkTotal = 0, sdkCorrect = 0;
  const badRedirects: number[] = [];
  const caughtAccount: number[] = [];
  const badToolCloses: number[] = [];

  for (const item of scored) {
    const isSup = item.labels.includes('support');
    const sdk = item.labels.find(l => SDK_LABELS.has(l));
    const kind = kinds[String(item.number)];
    const actions = route(
      { type: 'opened' },
      { labels: [], state: 'open', closedByWorkflow: false },
      { kind: 'answers', answers: item.answers },
      thresholds
    );
    const added = new Set(actions.filter(a => a.type === 'add-label').map(a => a.label));
    const closed = actions.some(a => a.type === 'close');

    if (isSup || sdk) {
      if (isSup && added.has('support')) tp++;
      else if (!isSup && added.has('support')) fp++;
      else if (isSup) fn++;
    }
    if (added.has('support: redirected')) {
      if (sdk || kind === 'hosted') badRedirects.push(item.number);
      if (kind === 'account') caughtAccount.push(item.number);
    }
    if (closed && added.has('tool-request') && (isSup || sdk || item.labels.includes('bug') || item.labels.includes('feature-request'))) {
      badToolCloses.push(item.number);
    }
    if (sdk && !isSup) {
      sdkTotal++;
      if (added.has(sdk)) sdkCorrect++;
    }
  }
  return { tp, fp, fn, recall: tp / (tp + fn || 1), precisionVsSdkLabeledNegatives: tp / (tp + fp || 1), badRedirects, caughtAccount, badToolCloses, sdkCorrect, sdkTotal };
}

if (import.meta.main) {
  const cacheIdx = process.argv.indexOf('--cache');
  const cachePath = cacheIdx >= 0 ? process.argv[cacheIdx + 1] : undefined;
  const kinds = JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as Record<string, 'account' | 'hosted'>;

  let scored: ScoredIssue[];
  if (cachePath && existsSync(cachePath)) {
    scored = JSON.parse(readFileSync(cachePath, 'utf8')) as ScoredIssue[];
  } else {
    const apiKey = process.env.TYPESAFE_API_KEY || '';
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required');
    const raw = fetchIssues().filter(i =>
      i.labels.some(l => l === 'support' || SDK_LABELS.has(l) || l === 'bug' || l === 'feature-request' || l === 'tool-request')
    );
    scored = await scoreIssues(raw, apiKey);
    if (cachePath) writeFileSync(cachePath, JSON.stringify(scored));
  }

  process.stdout.write(`Current THRESHOLDS: ${JSON.stringify(evaluate(scored, kinds, THRESHOLDS), null, 2)}\n`);
}
