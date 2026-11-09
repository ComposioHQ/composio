export const title = 'Connect an account and confirm authorization';
const baseState = v =>
  v.phase === 'done'
    ? v.output === 'pending'
      ? 'Authorization URL returned; still pending'
      : 'Account confirmed ACTIVE'
    : {
        context: 'Resolve project and acting user',
        alias: 'Check alias against visible accounts',
        response: 'Link request returned',
        handoff: 'Show the authorization URL',
        poll: 'Wait for account authorization',
        reply: 'Check account status',
        failed: 'Link failed; inspect account before retry',
      }[v.phase];
const steps = {
  ResolveScope: 'resolve project and user; load alias hints',
  RejectAlias: 'the requested alias is already in use',
  CreateLink: 'request a Tool Router or legacy link',
  RejectIncomplete: 'account id or redirect URL is missing',
  CheckAdditionalAccount: 'check the returned account and additional-account alias rule',
  ReturnPending: '--no-wait returns pending JSON',
  OpenAuthorization: 'show the URL and open it when allowed',
  RetrieveAccount: 'retrieve the connected account',
  ConfirmActive: 'report the confirmed ACTIVE account',
  Retry: 'retry a non-ACTIVE status or transient request failure',
  Timeout: 'exhaust the polling budget',
  Done: 'invocation ends',
};
export const step = (action, from, to) =>
  action === 'CheckAdditionalAccount'
    ? to.phase === 'failed'
      ? 'another account needs --alias; a remote link may already exist'
      : 'the returned new or reused account is allowed'
    : action === 'ConfirmActive'
      ? to.status === 'ACTIVE'
        ? 'the retrieved account is ACTIVE'
        : 'incorrectly announce a non-ACTIVE account'
      : (steps[action] ?? action);
export const group = v =>
  ['done', 'saved'].includes(v.phase)
    ? 'success'
    : ['failed', 'expired', 'interrupted', 'forced'].includes(v.phase)
      ? 'failure'
      : 'active';
export const colors = { success: 'teal', failure: 'orange', active: 'blue' };

export const state = v =>
  v.output === 'active' && v.status !== 'ACTIVE'
    ? 'Reports ACTIVE before account authorization'
    : baseState(v);
