export const title = 'Sign in and complete a browser handoff';
const labels = {
  start: 'Choose login method',
  cache: 'Keep browser handoff',
  waiting: 'Open the login URL',
  polling: 'Wait for browser approval',
  reply: 'Check login status',
  verified: 'Login method accepted',
  saved: 'Credentials saved',
  done: 'Signed in',
  failed: 'Login failed; retry explicitly',
  expired: 'Handoff expired; start again',
};
const baseState = v => labels[v.phase];
const steps = {
  CreateSession: 'request a browser login',
  CacheHandoff: 'save the pending login',
  CheckDirectKey: 'validate a supplied key or ready agent',
  ResumeHandoff: 'complete login now or run login --poll',
  CacheExpires: 'resume after the local cache TTL',
  PollReply: 'receive a poll response',
  RequireLinked: 'accept the linked session',
  Retry: 'wait before polling again',
  GiveUp: 'exhaust the retry budget',
  PersistCredentials: 'save the credential',
  StoreFails: 'credential lookup or storage fails',
  Finish: 'report the stored login',
  Done: 'invocation ends',
};
export const step = (action, from, to) =>
  action === 'CheckDirectKey'
    ? to.phase === 'failed'
      ? 'the supplied key or agent verification fails'
      : 'the supplied key or ready agent is verified'
    : action === 'RequireLinked'
      ? to.verified
        ? 'the browser session is linked'
        : 'accept an unlinked browser session'
      : (steps[action] ?? action);
export const group = v =>
  ['done', 'saved'].includes(v.phase)
    ? 'success'
    : ['failed', 'expired', 'interrupted', 'forced'].includes(v.phase)
      ? 'failure'
      : 'active';
export const colors = { success: 'teal', failure: 'orange', active: 'blue' };

const previousState = v =>
  v.phase === 'verified' && !v.verified
    ? 'Unlinked browser session incorrectly accepted'
    : baseState(v);

export const state = v =>
  v.persisted && !v.verified
    ? previousState(v) + ' (unverified credential stored)'
    : previousState(v);
