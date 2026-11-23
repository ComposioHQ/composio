import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { classifyWithJev } from './jev.ts';
import { THRESHOLDS, route, type JevAnswers, type Thresholds } from './route.ts';

type RawIssue = { number: number; title: string; body: string; labels: string[]; created_at: string };
type ScoredIssue = RawIssue & { answers: JevAnswers };

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
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as RawIssue);
}

async function scoreIssues(issues: RawIssue[], apiKey: string): Promise<ScoredIssue[]> {
  const queue = [...issues];
  const scored: ScoredIssue[] = [];
  async function worker() {
    while (queue.length > 0) {
      const issue = queue.shift()!;
      const answers = await classifyWithJev({ title: issue.title, body: issue.body }, { apiKey });
      scored.push({ ...issue, answers });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return scored.sort((a, b) => a.number - b.number);
}

function evaluate(
  scored: ScoredIssue[],
  supportKinds: Record<string, 'account' | 'hosted'>,
  thresholds: Thresholds
) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const badRedirects: number[] = [];
  const caughtAccount: number[] = [];
  const badToolCloses: number[] = [];
  let sdkTotal = 0;
  let sdkCorrect = 0;

  for (const item of scored) {
    const isSupportTruth = item.labels.includes('support');
    const sdkTruth = item.labels.find(l => SDK_LABELS.has(l));
    const kind = supportKinds[String(item.number)];
    const actions = route(
      { type: 'opened' },
      { labels: [], state: 'open', closedByWorkflow: false },
      { kind: 'answers', answers: item.answers },
      thresholds
    );
    const added = new Set(actions.filter(a => a.type === 'add-label').map(a => a.label));
    const closed = actions.some(a => a.type === 'close');
    const routedSupport = added.has('support');

    if (isSupportTruth || sdkTruth) {
      if (isSupportTruth && routedSupport) tp++;
      else if (!isSupportTruth && routedSupport) fp++;
      else if (isSupportTruth && !routedSupport) fn++;
    }
    if (added.has('support: redirected')) {
      if (sdkTruth || kind === 'hosted') badRedirects.push(item.number);
      if (kind === 'account') caughtAccount.push(item.number);
    }
    if (closed && added.has('tool-request')) {
      if (isSupportTruth || sdkTruth || item.labels.includes('bug') || item.labels.includes('feature-request')) {
        badToolCloses.push(item.number);
      }
    }
    if (sdkTruth && !isSupportTruth) {
      sdkTotal++;
      if (added.has(sdkTruth)) sdkCorrect++;
    }
  }

  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  return { tp, fp, fn, recall, precision, badRedirects, caughtAccount, badToolCloses, sdkCorrect, sdkTotal };
}

async function main() {
  const cacheIdx = process.argv.indexOf('--cache');
  const cachePath = cacheIdx >= 0 ? process.argv[cacheIdx + 1] : undefined;
  const supportKinds = JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as Record<string, 'account' | 'hosted'>;

  let scored: ScoredIssue[];
  if (cachePath && existsSync(cachePath)) {
    scored = JSON.parse(readFileSync(cachePath, 'utf8')) as ScoredIssue[];
  } else {
    const apiKey = process.env.TYPESAFE_API_KEY || '';
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required');
    const raw = fetchIssues().filter(
      i =>
        i.labels.includes('support') ||
        i.labels.some(l => SDK_LABELS.has(l)) ||
        i.labels.includes('bug') ||
        i.labels.includes('feature-request') ||
        i.labels.includes('tool-request')
    );
    scored = await scoreIssues(raw, apiKey);
    if (cachePath) writeFileSync(cachePath, JSON.stringify(scored));
  }

  const current = evaluate(scored, supportKinds, THRESHOLDS);
  console.log('Current THRESHOLDS:', JSON.stringify(current, null, 2));

  console.log('\nCandidate grid (recall >= 0.90, precision >= 0.80, 0 bad redirects):');
  for (const accountRedirect of [0.75, 0.8, 0.85, 0.9]) {
    for (const accountUnclear of [0.45, 0.5, 0.55, 0.6]) {
      for (const hostedForward of [0.55, 0.6, 0.65, 0.7]) {
        for (const hostedUnclear of [0.4, 0.45, 0.5]) {
          if (hostedUnclear >= hostedForward || accountUnclear >= accountRedirect) continue;
          const res = evaluate(scored, supportKinds, {
            ...THRESHOLDS,
            accountRedirect,
            accountUnclear,
            hostedForward,
            hostedUnclear,
          });
          if (res.recall >= 0.9 && res.precision >= 0.8 && res.badRedirects.length === 0) {
            console.log(
              `ar=${accountRedirect} au=${accountUnclear} hf=${hostedForward} hu=${hostedUnclear} ` +
                `recall=${res.recall.toFixed(3)} prec=${res.precision.toFixed(3)} caught=${res.caughtAccount.join(',')}`
            );
          }
        }
      }
    }
  }
}

await main();
