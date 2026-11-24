import { Array as Arr, Config, Console, Effect, FileSystem, Option, Order, Schema, Stdio, Stream } from 'effect';
import { runScript } from '../lib/actions.ts';
import { GitHub, PositiveInt, paginateArray } from '../lib/github.ts';
import { Jev, JevAnswers } from './jev.ts';
import { SUPPORT_LABEL, THRESHOLDS, route, type Thresholds } from './route.ts';

const SINCE = '2026-04-01T00:00:00Z';
const SDK_LABELS: ReadonlySet<string> = new Set(['ts', 'py', 'cli', 'docs']);
/** Issues whose labels say something about routing; everything else is skipped before scoring. */
const SIGNAL_LABELS: ReadonlySet<string> = new Set([SUPPORT_LABEL, ...SDK_LABELS, 'bug', 'feature-request', 'tool-request']);
const LABELS_PATH = `${import.meta.dir}/calibration-labels.json`;

const ListedIssue = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  created_at: Schema.String,
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  pull_request: Schema.optionalKey(Schema.Unknown),
});

export const ScoredIssue = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  body: Schema.String,
  labels: Schema.Array(Schema.String),
  created_at: Schema.String,
  answers: JevAnswers,
});
export type ScoredIssue = typeof ScoredIssue.Type;

/** Confirmed support kinds by issue number, for issues the `support` label alone does not settle. */
const SupportKinds = Schema.Record(Schema.String, Schema.Literals(['account', 'hosted']));
type SupportKinds = typeof SupportKinds.Type;

// Support precision is measured only against SDK-labeled, non-support issues. Bug, feature-request,
// and tool-request labels feed other checks and do not establish support negatives.
export function evaluate(scored: ReadonlyArray<ScoredIssue>, kinds: SupportKinds, thresholds: Thresholds) {
  const outcomes = scored.map(item => {
    const actions = route(
      { type: 'opened' },
      { labels: [], state: 'open', closedByWorkflow: false },
      { kind: 'answers', answers: item.answers },
      thresholds
    );
    const added = new Set(actions.flatMap(action => (action.type === 'add-label' ? [action.label] : [])));
    const isSupport = item.labels.includes(SUPPORT_LABEL);
    const sdk = item.labels.find(label => SDK_LABELS.has(label));
    const routedSupport = added.has(SUPPORT_LABEL);
    const redirected = added.has('support: redirected');
    const toolClosed = added.has('tool-request') && actions.some(action => action.type === 'close');
    return {
      number: item.number,
      tp: isSupport && routedSupport,
      fp: !isSupport && sdk !== undefined && routedSupport,
      fn: isSupport && !routedSupport,
      badRedirect: redirected && (sdk !== undefined || kinds[item.number] === 'hosted'),
      caughtAccount: redirected && kinds[item.number] === 'account',
      badToolClose:
        toolClosed && (isSupport || sdk !== undefined || item.labels.some(label => label === 'bug' || label === 'feature-request')),
      sdkCohort: sdk !== undefined && !isSupport,
      sdkCorrect: sdk !== undefined && !isSupport && added.has(sdk),
    };
  });
  const count = (key: 'tp' | 'fp' | 'fn' | 'sdkCohort' | 'sdkCorrect') => outcomes.filter(outcome => outcome[key]).length;
  const numbers = (key: 'badRedirect' | 'caughtAccount' | 'badToolClose') =>
    outcomes.flatMap(outcome => (outcome[key] ? [outcome.number] : []));
  const [tp, fp, fn] = [count('tp'), count('fp'), count('fn')];
  return {
    tp,
    fp,
    fn,
    recall: tp / (tp + fn || 1),
    precisionVsSdkLabeledNegatives: tp / (tp + fp || 1),
    badRedirects: numbers('badRedirect'),
    caughtAccount: numbers('caughtAccount'),
    badToolCloses: numbers('badToolClose'),
    sdkCorrect: count('sdkCorrect'),
    sdkTotal: count('sdkCohort'),
  };
}

const fetchIssues = Effect.gen(function* () {
  const token = yield* Config.String('GITHUB_TOKEN');
  const listed = yield* Stream.runCollect(
    paginateArray(`/repos/ComposioHQ/composio/issues?state=all&since=${SINCE}`, ListedIssue)
  ).pipe(Effect.provide(GitHub.layer(token)));
  return listed.flatMap(issue =>
    issue.pull_request === undefined && issue.created_at >= SINCE
      ? [{ ...issue, body: issue.body ?? '', labels: issue.labels.map(label => label.name) }]
      : []
  );
});

const scoreIssues = Effect.gen(function* () {
  const jev = yield* Jev;
  const issues = (yield* fetchIssues).filter(issue => issue.labels.some(label => SIGNAL_LABELS.has(label)));
  const scored = yield* Effect.forEach(
    issues,
    issue => Effect.map(jev.classify(issue), answers => ({ ...issue, answers })),
    { concurrency: 6 }
  );
  return Arr.sort(scored, Order.mapInput(Order.Number, (issue: ScoredIssue) => issue.number));
});

/** `bun scripts/issue-triage/calibrate.ts [--cache <file>]`: scores live issues, or reuses the cache. */
const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const args = yield* (yield* Stdio.Stdio).args;
  const flag = args.indexOf('--cache');
  const cache = flag < 0 ? Option.none<string>() : Option.fromNullishOr(args[flag + 1]);
  const kinds = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SupportKinds))(
    yield* fs.readFileString(LABELS_PATH)
  );
  const cached = yield* Option.match(cache, {
    onNone: () => Effect.succeedNone,
    onSome: path =>
      Effect.flatMap(fs.exists(path), exists =>
        exists
          ? Effect.map(
              Effect.flatMap(fs.readFileString(path), Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(ScoredIssue)))),
              Option.some
            )
          : Effect.succeedNone
      ),
  });
  const scored = yield* Option.match(cached, {
    onSome: Effect.succeed,
    onNone: () =>
      scoreIssues.pipe(
        Effect.tap(fresh => Option.match(cache, { onNone: () => Effect.void, onSome: path => fs.writeFileString(path, JSON.stringify(fresh)) })),
        Effect.provide(Jev.layer)
      ),
  });
  yield* Console.log(`Current THRESHOLDS: ${JSON.stringify(evaluate(scored, kinds, THRESHOLDS), null, 2)}`);
});

if (import.meta.main) runScript(main);
