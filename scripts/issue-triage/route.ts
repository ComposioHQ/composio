import type { JevAnswers, SdkArea } from './jev.ts';
import { SDK_AREAS } from './jev.ts';

export const SUPPORT_LABEL = 'support';
export const TRIAGE_LABEL = 'triage';
export const REDIRECT_PENDING = 'triage: redirect pending';
export const REDIRECTED = 'support: redirected';
export const FORWARDED = 'support: forwarded';
export const NEEDS_HUMAN = 'support: needs human';
export const FORWARD_FAILED = 'support: forward failed';
export const SUPPORT_STATE_LABELS = [REDIRECTED, FORWARDED, NEEDS_HUMAN, FORWARD_FAILED] as const;
export type SupportStateLabel = (typeof SUPPORT_STATE_LABELS)[number];

export const LABEL_METADATA: Readonly<Record<string, { readonly color: string; readonly description: string }>> = {
  [SUPPORT_LABEL]: { color: '0e8a16', description: 'Needs support team follow-up' },
  [REDIRECT_PENDING]: { color: 'cfd3d7', description: 'Redirect started; apply can finish it on retry' },
  [REDIRECTED]: { color: 'cfd3d7', description: 'Redirected to the dashboard Support page' },
  [FORWARDED]: { color: '0e8a16', description: 'Forwarded to the support team in Plain' },
  [NEEDS_HUMAN]: { color: 'fbca04', description: 'Support signal unclear; needs maintainer triage' },
  [FORWARD_FAILED]: { color: 'd93f0b', description: 'Forwarding to Plain failed; retry via dispatch or triage label' },
};
export const ASSIGNEES: Readonly<Record<SdkArea, readonly string[]>> = {
  docs: ['shawnesquivel', 'Sushmithamallesh'],
  py: ['jkomyno'],
  ts: ['jkomyno'],
  cli: ['CryogenicPlanet'],
};

export const DASHBOARD_SUPPORT_URL = 'https://dashboard.composio.dev/~/org/support';
// Deterministic marker so a retried redirect can detect that its comment was already posted.
export const REDIRECT_MARKER = '<!-- composio-support-redirected -->';
export const REDIRECT_COMMENT = [
  REDIRECT_MARKER,
  `This looks like an account-specific support request. Please open a ticket from the Support page in your Composio dashboard: ${DASHBOARD_SUPPORT_URL}. Tickets filed there are tied to your account, so the team can inspect your connections and logs and reply directly.`,
  '',
  'If this problem is not specific to your account, reply here and this issue will be reopened and forwarded to the support team.',
].join('\n');

export const TOOL_REQUEST_COMMENT = [
  '🤖 beep boop — hey, I think this is a tool request! Please file it at https://request.composio.dev/boards/tool-requests so the team can track and prioritize it.',
  '',
  "I've tagged this as `tool-request` and closed it here.",
  '',
  'If you think I got this wrong, feel free to reopen the issue.',
].join('\n');

export const MISSING_DETAILS_COMMENT =
  '🤖 Automated triage note: this issue is missing details needed to investigate it. Please add the steps to reproduce, the expected and actual behavior, your environment (package or CLI version, runtime, OS), and any relevant logs or screenshots. This automated note cannot reply in a conversation.';

// Calibrated on 2026-04+ labeled issues via calibrate.ts. Previously reported (not re-measured): recall 0.955,
// precision against SDK-labeled negatives 0.922, 0 false redirects. SDK labels do not establish every negative.
// Every boundary uses >= so a score equal to a threshold activates that branch.
export const THRESHOLDS = {
  // Catches account-only login/org issues (#3321 at 0.80, #5173 at 0.78) above the highest hosted issue (#3930 at 0.76).
  accountRedirect: 0.78,
  // Holds borderline account-vs-hosted issues (0.65–0.77) for human triage instead of auto-closing or forwarding.
  accountUnclear: 0.65,
  // Forwards clear hosted toolkit and backend defects to Plain while keeping the unclear band small.
  hostedForward: 0.6,
  // Holds moderate hosted signals (0.50–0.59) in support: needs human for maintainer review.
  hostedUnclear: 0.5,
  // Minimum choice probability to assign an SDK area label (90/91 agreement on non-support SDK issues).
  sdkArea: 0.5,
  // Bar for adding the bug label.
  isBug: 0.5,
  // Bar for adding feature-request and protecting feature requests from tool-request auto-close.
  featureRequest: 0.5,
  // Bar for labeling tool-request and closing with the request-board note when neither bug nor feature-request.
  newToolkit: 0.7,
  // Bar for posting the fixed missing-details note on non-support, non-tool-request issues.
  missingDetails: 0.65,
} as const;

export type Thresholds = Readonly<{ [K in keyof typeof THRESHOLDS]: number }>;

export type TriageEvent =
  | { readonly type: 'opened' | 'reopened' | 'edited' | 'author-comment' | 'dispatch' }
  | { readonly type: 'labeled'; readonly label: string };
export type IssueContext = {
  readonly labels: readonly string[];
  readonly state: 'open' | 'closed';
  readonly closedByWorkflow: boolean;
  readonly rerun?: boolean;
};
export type ClassificationInput =
  | { readonly kind: 'answers'; readonly answers: JevAnswers }
  | { readonly kind: 'failed' }
  | { readonly kind: 'none' };
export type TriageAction =
  | { readonly type: 'add-label' | 'remove-label'; readonly label: string }
  | { readonly type: 'add-assignees'; readonly assignees: readonly string[] }
  | { readonly type: 'comment'; readonly body: string }
  | { readonly type: 'close'; readonly reason?: 'completed' | 'not_planned' }
  | { readonly type: 'reopen' | 'forward' };

export const isSupportStateLabel = (label: string): label is SupportStateLabel =>
  (SUPPORT_STATE_LABELS as readonly string[]).includes(label);

const add = (label: string): TriageAction => ({ type: 'add-label', label });
const remove = (label: string): TriageAction => ({ type: 'remove-label', label });
const addMissing = (labels: readonly string[], label: string): TriageAction[] =>
  labels.includes(label) ? [] : [add(label)];
const removePresent = (labels: readonly string[], label: string): TriageAction[] =>
  labels.includes(label) ? [remove(label)] : [];

/** Moves the issue into exactly one support state. */
const moveTo = (labels: readonly string[], target: SupportStateLabel): TriageAction[] => [
  ...addMissing(labels, SUPPORT_LABEL),
  ...labels.filter(label => isSupportStateLabel(label) && label !== target).map(remove),
  ...addMissing(labels, target),
];
const redirect = (labels: readonly string[]): TriageAction[] => [
  ...moveTo(labels, REDIRECTED),
  { type: 'comment', body: REDIRECT_COMMENT },
  { type: 'close', reason: 'not_planned' },
  ...removePresent(labels, TRIAGE_LABEL),
];
const forward = (labels: readonly string[]): TriageAction[] => [...moveTo(labels, FORWARDED), { type: 'forward' }];

// An explicit maintainer request: the triage label or a numbered dispatch.
const isTriageRequest = (event: TriageEvent) =>
  event.type === 'dispatch' || (event.type === 'labeled' && event.label === TRIAGE_LABEL);

export function needsClassification(event: TriageEvent, labels: readonly string[]): boolean {
  if (event.type === 'author-comment') return false;
  const states = labels.filter(isSupportStateLabel);
  // Triage on needs human requests a fresh classification; every other explicit state is preserved or retried directly.
  if (isTriageRequest(event)) return states.every(label => label === NEEDS_HUMAN);
  if (event.type === 'labeled') return false;
  return !labels.includes(SUPPORT_LABEL) && states.length === 0;
}

/** Support bands, checked in order: the first answer at or above its threshold decides the state. */
const SUPPORT_BANDS = [
  { signal: 'account_specific', threshold: 'accountRedirect', state: REDIRECTED },
  { signal: 'account_specific', threshold: 'accountUnclear', state: NEEDS_HUMAN },
  { signal: 'hosted_problem', threshold: 'hostedForward', state: FORWARDED },
  { signal: 'hosted_problem', threshold: 'hostedUnclear', state: NEEDS_HUMAN },
] as const satisfies ReadonlyArray<{
  signal: keyof JevAnswers;
  threshold: keyof Thresholds;
  state: SupportStateLabel;
}>;

function supportState(answers: JevAnswers, labels: readonly string[], canClose: boolean, thresholds: Thresholds) {
  const band = SUPPORT_BANDS.find(({ signal, threshold }) => answers[signal] >= thresholds[threshold]);
  // Only an opened issue or an explicit request may close; anything else waits for a human.
  if (band) return band.state === REDIRECTED && !canClose ? NEEDS_HUMAN : band.state;
  if (!labels.includes(SUPPORT_LABEL)) return null;
  return labels.includes(NEEDS_HUMAN) ? NEEDS_HUMAN : FORWARDED;
}

function pickSdkArea(probabilities: JevAnswers['sdk_area'], threshold: number): SdkArea | null {
  const best = SDK_AREAS.reduce((left, right) => (probabilities[right] > probabilities[left] ? right : left));
  return probabilities[best] >= threshold && probabilities[best] >= probabilities.none ? best : null;
}

/** Bug, area, feature-request, tool-request, and missing-details handling for a classified issue. */
function issueTriage(
  answers: JevAnswers,
  labels: readonly string[],
  isSupport: boolean,
  canClose: boolean,
  thresholds: Thresholds
): TriageAction[] {
  const isBug = answers.is_bug >= thresholds.isBug;
  const isFeatureRequest = answers.feature_request >= thresholds.featureRequest;
  const area = pickSdkArea(answers.sdk_area, thresholds.sdkArea);
  const toolRequest =
    !isSupport && !isBug && !isFeatureRequest && !area && answers.new_toolkit >= thresholds.newToolkit;
  const missingDetails = !isSupport && !toolRequest && answers.missing_details >= thresholds.missingDetails;
  return [
    ...(isBug ? addMissing(labels, 'bug') : []),
    ...(area ? [...addMissing(labels, area), { type: 'add-assignees' as const, assignees: ASSIGNEES[area] }] : []),
    ...(toolRequest ? addMissing(labels, 'tool-request') : []),
    ...(toolRequest && canClose
      ? [{ type: 'comment' as const, body: TOOL_REQUEST_COMMENT }, { type: 'close' as const, reason: 'not_planned' as const }]
      : []),
    ...(!isBug && isFeatureRequest ? addMissing(labels, 'feature-request') : []),
    ...(missingDetails ? [{ type: 'comment' as const, body: MISSING_DETAILS_COMMENT }] : []),
  ];
}

/** A reporter's reply forwards a redirect the workflow closed, or one whose recovery is unfinished. */
function replyRecovery({ labels, state, closedByWorkflow }: IssueContext): TriageAction[] {
  const pending = labels.includes(FORWARD_FAILED) || labels.includes(REDIRECT_PENDING);
  const resumable = labels.includes(REDIRECTED) && (state === 'closed' ? closedByWorkflow : pending);
  if (!resumable) return [];
  return [...(state === 'closed' ? [{ type: 'reopen' as const }] : []), ...forward(labels), ...removePresent(labels, TRIAGE_LABEL)];
}

/** Without fresh answers: retry a failed forward, clear a reopened redirect, or honor a maintainer's label. */
function withoutAnswers(event: TriageEvent, labels: readonly string[], retryForward: boolean): TriageAction[] {
  if (retryForward) return [...forward(labels), ...removePresent(labels, TRIAGE_LABEL)];
  if (event.type === 'reopened') return removePresent(labels, REDIRECT_PENDING);
  const manualForward =
    event.type === 'labeled' && (event.label === SUPPORT_LABEL || event.label === FORWARDED) && labels.includes(event.label);
  return manualForward ? forward(labels) : [];
}

export function route(
  event: TriageEvent,
  issue: IssueContext,
  input: ClassificationInput,
  thresholds: Thresholds = THRESHOLDS
): TriageAction[] {
  const { labels } = issue;
  const unfinishedRedirect = labels.includes(REDIRECTED) && labels.includes(REDIRECT_PENDING);
  if (event.type === 'author-comment') return replyRecovery(issue);
  if (issue.state === 'closed') {
    // A rerun only finishes the cleanup of a redirect it already closed.
    const cleanup = issue.rerun === true && issue.closedByWorkflow && unfinishedRedirect;
    return cleanup ? [...removePresent(labels, TRIAGE_LABEL), remove(REDIRECT_PENDING)] : [];
  }
  if (input.kind === 'failed') return addMissing(labels, TRIAGE_LABEL);

  const explicit = isTriageRequest(event);
  const canClose = event.type === 'opened' || explicit;
  // Rerunning apply can replay Jev answers from before the workflow recorded these states.
  const retryForward = (explicit || issue.rerun === true) && labels.includes(FORWARD_FAILED);
  if (!retryForward && canClose && unfinishedRedirect) return redirect(labels);
  if (input.kind === 'none') return withoutAnswers(event, labels, retryForward);

  // Explicit states other than needs human are preserved; triage on needs human is a fresh classification.
  const keptState = labels.some(label => isSupportStateLabel(label) && label !== NEEDS_HUMAN);
  const state = retryForward ? FORWARDED : keptState ? null : supportState(input.answers, labels, canClose, thresholds);
  if (state === REDIRECTED) return redirect(labels);
  const support = state === FORWARDED ? forward(labels) : state === NEEDS_HUMAN ? moveTo(labels, NEEDS_HUMAN) : [];
  return [
    ...support,
    ...issueTriage(input.answers, labels, state !== null || keptState, canClose, thresholds),
    ...removePresent(labels, TRIAGE_LABEL),
  ];
}
