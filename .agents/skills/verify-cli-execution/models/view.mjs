export const title = 'Validate and execute a tool';
const labels = {
  start: 'Resolve project, user, and account',
  validate: 'Check arguments and connection hints',
  dry: 'Build local dry-run summary',
  permission: 'Check tool permission',
  send: 'Prepare files and selected transport',
  inflight: 'Tool request sent',
  reply: 'Read the tool result',
  uncertain: 'No complete answer; outcome uncertain',
  output: 'Prepare stdout or result file',
  done: 'Result delivered',
  failed: 'Command failed; inspect outcome before retry',
};
const baseState = v => labels[v.phase];
const steps = {
  ResolveContext: 'resolve execution context',
  RejectInput: 'arguments or connection check fails',
  Validate: 'arguments pass or checks are explicitly skipped',
  DrySummary: 'return a dry-run summary',
  PermissionAllowed: 'permission allows or skips approval',
  PermissionDenied: 'permission is denied',
  SendTool: 'send once to the selected transport',
  ToolReply: 'receive the tool result',
  RequestLost: 'lose the response or reach the deadline',
  ReportFailure: 'emit failure and exit nonzero',
  PrepareOutput: 'tool reports success',
  WriteOutput: 'write inline data or a result-file summary',
  OutputFails: 'result storage or output fails',
  Done: 'invocation ends',
};
export const step = (action, from, to) =>
  action === 'Validate'
    ? to.phase === 'dry'
      ? 'arguments accepted [dry run]'
      : 'arguments accepted [normal execution]'
    : (steps[action] ?? action);
export const group = v =>
  ['done', 'saved'].includes(v.phase)
    ? 'success'
    : ['failed', 'expired', 'interrupted', 'forced'].includes(v.phase)
      ? 'failure'
      : 'active';
export const colors = { success: 'teal', failure: 'orange', active: 'blue' };

export const state = v =>
  v.dryRun && v.sent > 0 ? baseState(v) + ' (tool sent during a dry run)' : baseState(v);
