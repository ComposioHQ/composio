import { runAgentSignupFlow } from 'src/effects/agent-signup';

/** The flags of `composio signup`. */
export type SignupParams = {
  readonly noWait: boolean;
  readonly noLogin: boolean;
  readonly force: boolean;
};

/** Runs the agent signup flow `composio agent signup` shares, under this command's name. */
export const runSignup = (params: SignupParams) =>
  runAgentSignupFlow({ ...params, commandLabel: 'composio signup' });
