/**
 * TypeSafe (Jev) Example
 *
 * Jev picks a Hacker News tool from a plain-language request and binds the arguments
 * it can. You complete the rest, then execute.
 *
 * Prerequisites:
 * 1. Set COMPOSIO_API_KEY and TYPESAFE_API_KEY in the .env file
 * 2. Run the example: pnpm start
 */
import { Composio } from '@composio/core';
import { TypesafeProvider } from '@composio/typesafe';
import 'dotenv/config';
import { requireEnv } from './env';

requireEnv('COMPOSIO_API_KEY', 'TYPESAFE_API_KEY');

const provider = new TypesafeProvider();
const composio = new Composio({ provider });

const USER_ID = 'default';
const REQUEST = "Look up the Hacker News user 'pg'";

/** What your application already knows. Jev never writes free text such as a username. */
const KNOWN_ARGUMENTS: Record<string, Record<string, unknown>> = {
  HACKERNEWS_GET_USER: { username: 'pg' },
};

async function main() {
  const toolSet = await composio.tools.get(USER_ID, {
    tools: ['HACKERNEWS_GET_USER', 'HACKERNEWS_GET_TOP_STORIES', 'HACKERNEWS_SEARCH_POSTS'],
  });
  console.log(`Compiled ${toolSet.tools.length} tools into Jev questions`);

  const decision = await provider.decide(toolSet, REQUEST);
  console.log('Decision:', JSON.stringify(decision, null, 2));

  if (decision.kind === 'abstain') {
    console.log(`Jev abstained: ${decision.reason}`);
    return;
  }

  // This example runs against real accounts, so it only ever executes read-only tools.
  if (decision.risk !== 'read_only') {
    console.log(`Not executing ${decision.tool}: its risk class is ${decision.risk}`);
    return;
  }

  if (decision.kind === 'partial') {
    console.log('Still missing:', decision.missing.map(path => path.join('.')).join(', '));
  }

  // A partial call is completed with caller arguments. They win over Jev-bound values.
  const result = await provider.execute(USER_ID, decision, {
    arguments: KNOWN_ARGUMENTS[decision.tool] ?? {},
  });
  console.log('Result:', result.data);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
