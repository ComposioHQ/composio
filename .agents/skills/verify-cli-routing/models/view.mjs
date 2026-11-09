export const title = 'Choose the project, acting user, and connected account';
const labels = {
  start: 'Resolve the command project',
  project: 'Choose the acting user',
  account: 'Resolve --account or a default',
  ready: 'Account selected',
  unconnected: 'No active account; caller decides',
  failed: 'Fix project, user, or account choice',
};
const baseState = v => labels[v.phase];
const steps = {
  ResolveProject: 'resolve the consumer or developer project',
  MissingProject: 'project is missing or lookup fails',
  ResolveUser: 'resolve a user against that project',
  MissingUser: 'no acting user is available',
  SelectAccount: 'use the sole, default, or explicitly selected account',
  NoAccount: 'no active account exists',
  RejectSelector: 'the selector matches no usable account',
  RejectAmbiguity: 'multiple usable accounts have no default',
  GuessNewest: 'silently choose the newest account',
  Done: 'resolution ends',
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
  v.phase === 'ready' && v.scenario === 'ambiguous'
    ? 'Newest account guessed despite ambiguity'
    : baseState(v);
