export const title = 'Listen, finish accepted events, and clean up';
const baseState = v =>
  ({
    start: 'Prepare event files',
    connecting: 'Create trigger if needed; subscribe',
    listening: 'Accept matching events',
    draining: 'Finish accepted writes, up to ten seconds',
    release: 'Release subscription and event workers',
    cleanup: 'Wait for the trigger-disable result',
    report: 'Report sink failures',
    done: 'Listener stopped',
    forced: 'Forced stop; cleanup may be incomplete',
  })[v.phase];
const steps = {
  Acquire: 'prepare subscription and temporary trigger',
  Subscribe: 'subscription succeeds',
  SubscriptionFails: 'subscription fails',
  AcceptEvent: 'accept a matching unique event',
  WriteEvent: 'save or emit the accepted event',
  SinkFails: 'a sink fails; count and diagnose it',
  NormalStop: 'event limit or timeout fires',
  SignalStop: 'Ctrl+C or SIGTERM cancels pending writes',
  FailFast: 'fail-fast stops after a sink failure',
  FinishDrain: 'accepted writes settle',
  DrainDeadline: 'the ten-second drain budget expires',
  ReleaseTrigger: 'attempt to disable the temporary trigger',
  CleanupReply: 'disable returns success or a warning',
  SkipRelease: 'skip trigger cleanup',
  ReportStop: 'report sink failures and finish',
  ForceKill: 'second signal or runner deadline forces exit',
  Done: 'invocation ends',
};
export const step = action => steps[action] ?? action;
export const group = v =>
  ['done', 'saved'].includes(v.phase)
    ? 'success'
    : ['failed', 'expired', 'interrupted', 'forced'].includes(v.phase)
      ? 'failure'
      : 'active';
export const colors = { success: 'teal', failure: 'orange', active: 'blue' };

export const state = v =>
  v.phase === 'done' && v.temporary && !v.cleanup
    ? 'Stopped without attempting trigger cleanup'
    : baseState(v);
