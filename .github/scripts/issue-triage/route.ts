export type SdkArea = 'ts' | 'py' | 'cli' | 'docs';
export type SdkAreaChoice = SdkArea | 'none';

export type SupportStateLabel =
  | 'support: redirected'
  | 'support: forwarded'
  | 'support: needs human'
  | 'support: forward failed';

export type NoulQuestion = {
  readonly type: 'noul';
  readonly instructions: string;
};

export type ChoiceQuestion<T extends Record<string, string> = Record<string, string>> = {
  readonly type: 'choice';
  readonly instructions: string;
  readonly criteria: T;
};

export type JevAnswers = {
  readonly account_specific: number;
  readonly hosted_problem: number;
  readonly sdk_code: number;
  readonly new_toolkit: number;
  readonly is_bug: number;
  readonly missing_details: number;
  readonly feature_request: number;
  readonly sdk_area: Readonly<Record<SdkAreaChoice, number>>;
};

export type TriageEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'reopened' }
  | { readonly type: 'edited' }
  | { readonly type: 'labeled'; readonly label: string }
  | { readonly type: 'author-comment' }
  | { readonly type: 'dispatch' };

export type IssueContext = {
  readonly labels: readonly string[];
  readonly state: 'open' | 'closed';
  readonly closedByWorkflow: boolean;
};

export type ClassificationInput =
  | { readonly kind: 'answers'; readonly answers: JevAnswers }
  | { readonly kind: 'failed' }
  | { readonly kind: 'none' };

export type TriageAction =
  | { readonly type: 'add-label'; readonly label: string }
  | { readonly type: 'remove-label'; readonly label: string }
  | { readonly type: 'add-assignees'; readonly assignees: readonly string[] }
  | { readonly type: 'comment'; readonly body: string }
  | { readonly type: 'close'; readonly reason?: 'completed' | 'not_planned' }
  | { readonly type: 'reopen' }
  | { readonly type: 'forward' };

export const SUPPORT_LABEL = 'support';
export const TRIAGE_LABEL = 'triage';

export const SUPPORT_STATE_LABELS: readonly SupportStateLabel[] = [
  'support: redirected',
  'support: forwarded',
  'support: needs human',
  'support: forward failed',
];

export const LABEL_METADATA: Readonly<Record<string, { readonly color: string; readonly description: string }>> = {
  [SUPPORT_LABEL]: { color: '0e8a16', description: 'Needs support team follow-up' },
  'support: redirected': { color: 'cfd3d7', description: 'Redirected to the dashboard Support page' },
  'support: forwarded': { color: '0e8a16', description: 'Forwarded to the support team in Plain' },
  'support: needs human': { color: 'fbca04', description: 'Support signal unclear; needs maintainer triage' },
  'support: forward failed': { color: 'd93f0b', description: 'Forwarding to Plain failed; retry via dispatch or triage label' },
};

export const ASSIGNEES: Readonly<Record<SdkArea, readonly string[]>> = {
  docs: ['shawnesquivel', 'Sushmithamallesh'],
  py: ['jkomyno'],
  ts: ['jkomyno'],
  cli: ['CryogenicPlanet'],
};

export const DASHBOARD_SUPPORT_URL = 'https://dashboard.composio.dev/~/org/support';
export const REDIRECT_MARKER = '<!-- composio-support-redirected -->';

export const REDIRECT_COMMENT = [
  REDIRECT_MARKER,
  'This looks like an account-specific support request. Please open a ticket from the Support page in your Composio dashboard: ' +
    `${DASHBOARD_SUPPORT_URL}. Tickets filed there are tied to your account, so the team can inspect your connections and logs and reply directly.`,
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
    instructions:
      'Does `issue` ask Composio to add an app integration or toolkit that does not exist yet?',
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

// Calibrated on 2026-04+ labeled issues via calibrate.ts (recall 0.955, precision 0.922, 0 false redirects).
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

function hasSupportState(labels: readonly string[]): boolean {
  return labels.some(isSupportStateLabel);
}

export function needsClassification(event: TriageEvent, labels: readonly string[]): boolean {
  if (event.type === 'dispatch') return true;
  if (event.type === 'author-comment') return false;
  if (event.type === 'labeled') {
    return event.label === TRIAGE_LABEL && !hasSupportState(labels);
  }
  return !labels.includes(SUPPORT_LABEL) && !hasSupportState(labels);
}

function swapSupportState(
  actions: TriageAction[],
  labels: readonly string[],
  target: SupportStateLabel
): void {
  if (!labels.includes(SUPPORT_LABEL)) {
    actions.push({ type: 'add-label', label: SUPPORT_LABEL });
  }
  for (const existing of labels) {
    if (isSupportStateLabel(existing) && existing !== target) {
      actions.push({ type: 'remove-label', label: existing });
    }
  }
  if (!labels.includes(target)) {
    actions.push({ type: 'add-label', label: target });
  }
}

function pickSdkArea(probs: Readonly<Record<SdkAreaChoice, number>>, threshold: number): SdkArea | null {
  const areas: readonly SdkArea[] = ['ts', 'py', 'cli', 'docs'];
  let best: SdkArea | null = null;
  let bestScore = -1;
  for (const area of areas) {
    if (probs[area] > bestScore) {
      best = area;
      bestScore = probs[area];
    }
  }
  if (!best || bestScore < threshold || bestScore < probs.none) return null;
  return best;
}

export function route(
  event: TriageEvent,
  issue: IssueContext,
  input: ClassificationInput,
  thresholds: Thresholds = THRESHOLDS
): TriageAction[] {
  const { labels, state, closedByWorkflow } = issue;

  if (event.type === 'author-comment') {
    if (state !== 'closed' || !closedByWorkflow || !labels.includes('support: redirected')) {
      return [];
    }
    const actions: TriageAction[] = [{ type: 'reopen' }];
    swapSupportState(actions, labels, 'support: forwarded');
    actions.push({ type: 'forward' });
    return actions;
  }

  if (state === 'closed') return [];

  if (input.kind === 'failed') {
    return labels.includes(TRIAGE_LABEL) ? [] : [{ type: 'add-label', label: TRIAGE_LABEL }];
  }

  if (input.kind === 'none') {
    const actions: TriageAction[] = [];
    if (event.type === 'labeled') {
      if (event.label === SUPPORT_LABEL && labels.includes(SUPPORT_LABEL)) {
        swapSupportState(actions, labels, 'support: forwarded');
        actions.push({ type: 'forward' });
      } else if (event.label === 'support: forwarded' && labels.includes('support: forwarded')) {
        swapSupportState(actions, labels, 'support: forwarded');
        actions.push({ type: 'forward' });
      } else if (event.label === TRIAGE_LABEL && labels.includes('support: forward failed')) {
        swapSupportState(actions, labels, 'support: forwarded');
        actions.push({ type: 'forward' });
        if (labels.includes(TRIAGE_LABEL)) {
          actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
        }
      }
    }
    return actions;
  }

  const { answers } = input;
  const actions: TriageAction[] = [];
  const alreadyHasState = hasSupportState(labels);

  let supportOutcome: 'redirected' | 'forwarded' | 'needs-human' | null = null;
  if (!alreadyHasState && answers.account_specific >= thresholds.accountRedirect) {
    supportOutcome = 'redirected';
  } else if (answers.account_specific >= thresholds.accountUnclear) {
    supportOutcome = 'needs-human';
  } else if (answers.hosted_problem >= thresholds.hostedForward) {
    supportOutcome = 'forwarded';
  } else if (answers.hosted_problem >= thresholds.hostedUnclear) {
    supportOutcome = 'needs-human';
  } else if (labels.includes(SUPPORT_LABEL)) {
    supportOutcome = 'forwarded';
  }

  if (supportOutcome === 'redirected') {
    swapSupportState(actions, labels, 'support: redirected');
    actions.push({ type: 'comment', body: REDIRECT_COMMENT });
    actions.push({ type: 'close', reason: 'not_planned' });
    if (labels.includes(TRIAGE_LABEL)) {
      actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
    }
    return actions;
  }

  if (supportOutcome === 'forwarded') {
    swapSupportState(actions, labels, 'support: forwarded');
    actions.push({ type: 'forward' });
  } else if (supportOutcome === 'needs-human') {
    swapSupportState(actions, labels, 'support: needs human');
  }

  const isSupport = supportOutcome !== null;
  const isBug = answers.is_bug >= thresholds.isBug;
  const isNewToolkit = answers.new_toolkit >= thresholds.newToolkit;
  const isFeatureRequest = answers.feature_request >= thresholds.featureRequest;
  const isMissingDetails = answers.missing_details >= thresholds.missingDetails;
  const sdkArea = pickSdkArea(answers.sdk_area, thresholds.sdkArea);

  if (isBug && !labels.includes('bug')) {
    actions.push({ type: 'add-label', label: 'bug' });
  }
  if (sdkArea) {
    if (!labels.includes(sdkArea)) {
      actions.push({ type: 'add-label', label: sdkArea });
    }
    actions.push({ type: 'add-assignees', assignees: ASSIGNEES[sdkArea] });
  }

  const isToolRequest = !isBug && !isFeatureRequest && !sdkArea && isNewToolkit;
  const closeAsToolRequest = !isSupport && isToolRequest;

  if (isToolRequest) {
    if (!isSupport && !labels.includes('tool-request')) {
      actions.push({ type: 'add-label', label: 'tool-request' });
    }
    if (closeAsToolRequest) {
      actions.push({ type: 'comment', body: TOOL_REQUEST_COMMENT });
      actions.push({ type: 'close', reason: 'not_planned' });
    }
  } else if (!isBug && !sdkArea && isFeatureRequest && !labels.includes('feature-request')) {
    actions.push({ type: 'add-label', label: 'feature-request' });
  }

  if (!isSupport && !closeAsToolRequest && isMissingDetails) {
    actions.push({ type: 'comment', body: MISSING_DETAILS_COMMENT });
  }

  if (labels.includes(TRIAGE_LABEL)) {
    actions.push({ type: 'remove-label', label: TRIAGE_LABEL });
  }

  return actions;
}
