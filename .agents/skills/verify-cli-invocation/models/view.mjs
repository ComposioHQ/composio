export const title = 'Parse a command and report its outcome once';
const baseState = v =>
  ({
    parse: 'Parse argv and identify registration',
    begin: 'Start the selected command',
    invoke: 'Record command invoked',
    handle: 'Validate login and run the handler or help',
    outcome: 'Record success or failure',
    report: 'Print only an unreported failure',
    runner: 'Preserve exit markers for the runner',
    done: 'Invocation ended',
  })[v.phase];
const steps = {
  ParseErrorOutcome: 'keep the parse failure already printed by effect/cli',
  Parse: 'effect/cli selects a registration',
  RunHooks: 'run enabled hooks for parsed input',
  SkipHooks: 'help, version, bare group, or parse error skips hooks',
  RecordInvoked: 'record invoked after hooks',
  HandleSuccess: 'handler or help succeeds',
  HandleFailure: 'handler fails before printing',
  AlreadyPrintedFailure: 'parser or handler already reports the failure',
  RecordOutcome: 'record the same command outcome',
  PrintFailure: 'print failure and preserve its cause',
  NothingToPrint: 'nothing remains to print',
  Finish: 'runner uses the marked outcome',
  Done: 'invocation ends',
};
export const step = (action, from, to) =>
  action === 'Parse'
    ? to.kind === 'parse-error'
      ? 'effect/cli prints the parse error and names its command'
      : 'effect/cli selects a registration'
    : (steps[action] ?? action);
export const group = v =>
  ['done', 'saved'].includes(v.phase)
    ? 'success'
    : ['failed', 'expired', 'interrupted', 'forced'].includes(v.phase)
      ? 'failure'
      : 'active';
export const colors = { success: 'teal', failure: 'orange', active: 'blue' };

export const state = v =>
  v.hooks > 0 && v.kind !== 'action'
    ? baseState(v) + ' (hooks ran without a parsed action)'
    : baseState(v);
