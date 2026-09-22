/**
 * Companion flow: Jev shortlists tools, another provider's LLM uses them.
 *
 * Jev ranks a whole toolkit against the request in one fast call, so the LLM
 * only ever sees the few tools that matter.
 *
 * Run it with: pnpm start:shortlist
 */
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import { TypesafeProvider } from '@composio/typesafe';
import 'dotenv/config';
import { requireEnv } from './env';

requireEnv('COMPOSIO_API_KEY', 'TYPESAFE_API_KEY');

const typesafe = new TypesafeProvider();
const composio = new Composio({ provider: new OpenAIProvider() });

const USER_ID = 'default';
const REQUEST = 'What are the top stories on Hacker News right now?';

async function main() {
  const raw = await composio.tools.getRawComposioTools({ toolkits: ['hackernews'], limit: 50 });
  console.log(`Ranking ${raw.length} raw tools`);

  const { tools, scores } = await typesafe.shortlistTools(raw, REQUEST, { k: 3 });
  for (const { slug, score } of scores) console.log(`  ${score.toFixed(2)}  ${slug}`);

  // Re-fetch the shortlist for the provider that will talk to the LLM.
  const openaiTools = await composio.tools.get(USER_ID, { tools: tools.map(tool => tool.slug) });
  console.log(`Handing ${openaiTools.length} tools to OpenAI instead of ${raw.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
