export const title = 'Stop a listener or a supervised script';
const baseState = v =>
  v.phase === 'running'
    ? v.registered
      ? 'Ready to stop cooperatively'
      : 'Starting; signal would interrupt'
    : {
        stopping: v.interrupted
          ? 'Signal interrupts the invocation'
          : v.mode === 'run'
            ? 'Forward stop to the child process group'
            : 'Listener releases its resources',
        done: 'Command or child determines exit',
        interrupted: 'Interrupted; exit 128 plus signal',
        forced: 'Second signal or deadline forces exit',
      }[v.phase];
const steps = {
  NaturalExit: 'command or child ends before a stop signal',
  Register: 'subscription is acknowledged or child supervision starts',
  FirstSignal: 'receive Ctrl+C, SIGTERM, or SIGHUP',
  ChildGrace: 'a two-second child grace period expires',
  ChildExits: 'the script exits or dies by a signal',
  MirrorChild: 'mirror the child outcome, preserving the first escalation signal',
  ListenerStops: 'listener releases resources and exits cleanly',
  InterruptEnds: 'finish an interrupted command',
  Force: 'receive another signal or exceed ten seconds',
  Done: 'process ends',
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
  v.interrupted &&
  v.first !== 'none' &&
  v.registered &&
  (v.mode === 'run' || (v.mode === 'listener' && v.first !== 'HUP'))
    ? baseState(v) + ' (accepted stop incorrectly interrupted)'
    : baseState(v);
