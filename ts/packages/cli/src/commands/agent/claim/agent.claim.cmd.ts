import { Argument, Command } from 'effect/cli';
import { runAgentClaim } from './agent.claim.handler';

const email = Argument.String('email').pipe(
  Argument.withDescription('Human email address to invite as an admin for this agent org')
);

export const agentCmd$Claim = Command.make('claim', { email }, runAgentClaim).pipe(
  Command.withDescription('Invite a human admin to claim this agent org.')
);
