export type SdkArea = 'ts' | 'py' | 'cli' | 'docs';
export type SdkAreaChoice = SdkArea | 'none';
export type SupportStateLabel =
  | 'support: redirected'
  | 'support: forwarded'
  | 'support: needs human'
  | 'support: forward failed';

export type JevAnswers = {
  readonly account_specific: number; readonly hosted_problem: number; readonly sdk_code: number;
  readonly new_toolkit: number; readonly is_bug: number; readonly missing_details: number;
  readonly feature_request: number; readonly sdk_area: Readonly<Record<SdkAreaChoice, number>>;
};
export type TriageEvent = { readonly type: 'opened' | 'reopened' | 'edited' | 'author-comment' | 'dispatch' } | { readonly type: 'labeled'; readonly label: string };
export type IssueContext = {
  readonly labels: readonly string[];
  readonly state: 'open' | 'closed';
  readonly closedByWorkflow: boolean;
  readonly rerun?: boolean;
};
export type ClassificationInput = { readonly kind: 'answers'; readonly answers: JevAnswers } | { readonly kind: 'failed' | 'none' };
export type TriageAction =
  | { readonly type: 'add-label' | 'remove-label'; readonly label: string }
  | { readonly type: 'add-assignees'; readonly assignees: readonly string[] }
  | { readonly type: 'comment'; readonly body: string }
  | { readonly type: 'close'; readonly reason?: 'completed' | 'not_planned' }
  | { readonly type: 'reopen' | 'forward' };

export const SUPPORT_LABEL = 'support';
export const TRIAGE_LABEL = 'triage';
export const REDIRECT_PENDING = 'triage: redirect pending';
export const SUPPORT_STATE_LABELS: readonly SupportStateLabel[] = ['support: redirected', 'support: forwarded', 'support: needs human', 'support: forward failed'];
export const LABEL_METADATA: Readonly<Record<string, { readonly color: string; readonly description: string }>> = {
  [SUPPORT_LABEL]: { color: '0e8a16', description: 'Needs support team follow-up' },
  [REDIRECT_PENDING]: { color: 'cfd3d7', description: 'Redirect started; apply can finish it on retry' },
  'support: redirected': { color: 'cfd3d7', description: 'Redirected to the dashboard Support page' },
  'support: forwarded': { color: '0e8a16', description: 'Forwarded to the support team in Plain' },
  'support: needs human': { color: 'fbca04', description: 'Support signal unclear; needs maintainer triage' },
  'support: forward failed': { color: 'd93f0b', description: 'Forwarding to Plain failed; retry via dispatch or triage label' },
};
export const ASSIGNEES: Readonly<Record<SdkArea, readonly string[]>> = {
  docs: ['shawnesquivel', 'Sushmithamallesh'], py: ['jkomyno'], ts: ['jkomyno'], cli: ['CryogenicPlanet'],
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

export const QUESTIONS = {
  account_specific: {
    type: 'noul',
    instructions:
      "Does resolving `issue` need someone to look at the reporter's own Composio account, project, billing, usage limits, connected accounts, auth configs, or logs?",
  },
  hosted_problem: {
    type: 'noul',
    instructions:
      "Is the problem in `issue` on Composio's hosted service (API, dashboard, Connect, managed OAuth apps, hosted MCP, tool execution backend) or in how a specific hosted Composio toolkit or tool behaves (its parameters, output, auth scopes, or errors), rather than in code the reporter installs from this repository?",
  },
  sdk_code: {
    type: 'noul',
    instructions:
      'Does `issue` point at a defect, missing feature, or docs gap in the Python SDK, TypeScript SDK, Composio CLI, or documentation source code itself?',
  },
  new_toolkit: {
    type: 'noul',
    instructions: 'Does `issue` ask Composio to add an app integration or toolkit that does not exist yet?',
  },
  is_bug: {
    type: 'noul',
    instructions:
      'Is `issue` primarily reporting broken behavior, a defect, an error, a regression, or unexpected behavior (not a feature request, question, or new-toolkit request)?',
  },
  missing_details: {
    type: 'noul',
    instructions:
      'Is `issue` missing the information needed to reproduce or investigate it (such as reproduction steps, expected vs. actual behavior, environment, or error details)?',
  },
  feature_request: {
    type: 'noul',
    instructions:
      'Is `issue` asking for a new feature or improvement to the Composio SDKs, CLI, docs, or platform (not a request for a new app integration or toolkit)?',
  },
  sdk_area: {
    type: 'choice',
    instructions: 'Which area of this repository does `issue` primarily concern?',
    criteria: {
      ts: 'TypeScript SDK code or TypeScript packages other than the CLI in this repository',
      py: 'Python SDK code in this repository',
      cli: 'The Composio CLI experience or ts/packages/cli',
      docs: 'Documentation content or the docs site',
      none: 'None of the above (or primarily a hosted service, account, or new-toolkit request without a specific repository area)',
    },
  },
} as const;

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

export function isSupportStateLabel(label: string): label is SupportStateLabel {
  return (SUPPORT_STATE_LABELS as readonly string[]).includes(label);
}

export function parseEvent(eventName: string, payload: { action?: string; label?: { name?: string } }): TriageEvent {
  if (eventName === 'workflow_dispatch') return { type: 'dispatch' };
  if (eventName === 'issue_comment') return { type: 'author-comment' };
  if (payload.action === 'labeled') return { type: 'labeled', label: payload.label?.name ?? '' };
  return { type: (payload.action as 'opened' | 'reopened' | 'edited') ?? 'opened' };
}

const NEEDS_HUMAN = 'support: needs human';
const FORWARD_FAILED = 'support: forward failed';
const REDIRECTED = 'support: redirected';

// An explicit maintainer request: the triage label or a numbered dispatch.
function isTriageRequest(event: TriageEvent): boolean {
  return event.type === 'dispatch' || (event.type === 'labeled' && event.label === TRIAGE_LABEL);
}

export function needsClassification(event: TriageEvent, labels: readonly string[]): boolean {
  if (event.type === 'author-comment') return false;
  const states = labels.filter(isSupportStateLabel);
  // Triage on needs human requests a fresh classification; every other explicit state is preserved or retried directly.
  if (isTriageRequest(event)) return states.every(l => l === NEEDS_HUMAN);
  if (event.type === 'labeled') return false;
  return !labels.includes(SUPPORT_LABEL) && states.length === 0;
}

function swapSupportState(actions: TriageAction[], labels: readonly string[], target: SupportStateLabel): void {
  if (!labels.includes(SUPPORT_LABEL)) actions.push({ type: 'add-label', label: SUPPORT_LABEL });
  for (const l of labels) {
    if (isSupportStateLabel(l) && l !== target) actions.push({ type: 'remove-label', label: l });
  }
  if (!labels.includes(target)) actions.push({ type: 'add-label', label: target });
}

function pickSdkArea(probs: Readonly<Record<SdkAreaChoice, number>>, threshold: number): SdkArea | null {
  let best: SdkArea | null = null;
  for (const area of ['ts', 'py', 'cli', 'docs'] as const) {
    if (!best || probs[area] > probs[best]) best = area;
  }
  return best && probs[best] >= threshold && probs[best] >= probs.none ? best : null;
}

export function route(
  event: TriageEvent,
  issue: IssueContext,
  input: ClassificationInput,
  thresholds: Thresholds = THRESHOLDS
): TriageAction[] {
  const { labels, state, closedByWorkflow } = issue;
  if (event.type === 'author-comment') {
    // Open issues can still be forwarded if redirect or reply recovery is in progress.
    const pendingOpen = labels.includes(FORWARD_FAILED) || labels.includes(REDIRECT_PENDING);
    const resumable = labels.includes(REDIRECTED) && (state === 'closed' ? closedByWorkflow : pendingOpen);
    if (!resumable) return [];
    const actions: TriageAction[] = state === 'closed' ? [{ type: 'reopen' }] : [];
    swapSupportState(actions, labels, 'support: forwarded');
    actions.push({ type: 'forward' });
    if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
    return actions;
  }
  if (state === 'closed') {
    if (issue.rerun && closedByWorkflow && labels.includes(REDIRECTED) && labels.includes(REDIRECT_PENDING)) {
      const actions: TriageAction[] = [];
      if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
      actions.push({ type: 'remove-label', label: REDIRECT_PENDING });
      return actions;
    }
    return [];
  }
  if (input.kind === 'failed') {
    return labels.includes(TRIAGE_LABEL) ? [] : [{ type: 'add-label', label: TRIAGE_LABEL }];
  }
  const explicit = isTriageRequest(event);
  const canClose = event.type === 'opened' || explicit;
  // Rerunning apply can replay Jev answers from before the workflow recorded these states.
  const retryForward = (explicit || issue.rerun) && labels.includes(FORWARD_FAILED);
  if (!retryForward && canClose && labels.includes(REDIRECTED) && labels.includes(REDIRECT_PENDING)) {
    const actions: TriageAction[] = [];
    swapSupportState(actions, labels, REDIRECTED);
    actions.push({ type: 'comment', body: REDIRECT_COMMENT }, { type: 'close', reason: 'not_planned' });
    if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
    return actions;
  }
  if (input.kind === 'none') {
    const actions: TriageAction[] = [];
    if (retryForward) {
      // Direct Plain retry (no Jev); the failed state is retained by the caller until forwarding succeeds.
      swapSupportState(actions, labels, 'support: forwarded');
      actions.push({ type: 'forward' });
      if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
    } else if (event.type === 'reopened' && labels.includes(REDIRECT_PENDING)) {
      actions.push({ type: 'remove-label', label: REDIRECT_PENDING });
    } else if (event.type === 'labeled') {
      const manualForward =
        (event.label === SUPPORT_LABEL && labels.includes(SUPPORT_LABEL)) ||
        (event.label === 'support: forwarded' && labels.includes('support: forwarded'));
      if (manualForward) {
        swapSupportState(actions, labels, 'support: forwarded');
        actions.push({ type: 'forward' });
      }
    }
    return actions;
  }

  const { answers } = input;
  const actions: TriageAction[] = [];
  // Explicit states other than needs human are preserved; triage on needs human is a fresh classification.
  const keptState = labels.some(l => isSupportStateLabel(l) && l !== NEEDS_HUMAN);
  let supportOutcome: 'redirected' | 'forwarded' | 'needs-human' | null = null;
  if (retryForward) supportOutcome = 'forwarded';
  else if (keptState) supportOutcome = null;
  else if (answers.account_specific >= thresholds.accountRedirect) supportOutcome = canClose ? 'redirected' : 'needs-human';
  else if (answers.account_specific >= thresholds.accountUnclear) supportOutcome = 'needs-human';
  else if (answers.hosted_problem >= thresholds.hostedForward) supportOutcome = 'forwarded';
  else if (answers.hosted_problem >= thresholds.hostedUnclear) supportOutcome = 'needs-human';
  else if (labels.includes(SUPPORT_LABEL)) supportOutcome = labels.includes(NEEDS_HUMAN) ? 'needs-human' : 'forwarded';

  if (supportOutcome === 'redirected') {
    swapSupportState(actions, labels, 'support: redirected');
    actions.push({ type: 'comment', body: REDIRECT_COMMENT }, { type: 'close', reason: 'not_planned' });
    if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
    return actions;
  }
  if (supportOutcome === 'forwarded') {
    swapSupportState(actions, labels, 'support: forwarded');
    actions.push({ type: 'forward' });
  } else if (supportOutcome === 'needs-human') {
    swapSupportState(actions, labels, 'support: needs human');
  }

  const isSupport = supportOutcome !== null || keptState;
  const isBug = answers.is_bug >= thresholds.isBug;
  const isFeatureRequest = answers.feature_request >= thresholds.featureRequest;
  const sdkArea = pickSdkArea(answers.sdk_area, thresholds.sdkArea);
  if (isBug && !labels.includes('bug')) actions.push({ type: 'add-label', label: 'bug' });
  if (sdkArea) {
    if (!labels.includes(sdkArea)) actions.push({ type: 'add-label', label: sdkArea });
    actions.push({ type: 'add-assignees', assignees: ASSIGNEES[sdkArea] });
  }

  const isToolRequest = !isBug && !isFeatureRequest && !sdkArea && answers.new_toolkit >= thresholds.newToolkit;
  const closeAsToolRequest = !isSupport && isToolRequest;
  if (closeAsToolRequest) {
    if (!labels.includes('tool-request')) actions.push({ type: 'add-label', label: 'tool-request' });
    if (canClose) actions.push({ type: 'comment', body: TOOL_REQUEST_COMMENT }, { type: 'close', reason: 'not_planned' });
  } else if (!isBug && isFeatureRequest && !labels.includes('feature-request')) {
    actions.push({ type: 'add-label', label: 'feature-request' });
  }
  if (!isSupport && !closeAsToolRequest && answers.missing_details >= thresholds.missingDetails) {
    actions.push({ type: 'comment', body: MISSING_DETAILS_COMMENT });
  }
  if (labels.includes(TRIAGE_LABEL)) actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
  return actions;
}
