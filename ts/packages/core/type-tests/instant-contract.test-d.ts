/** Instant guide examples are checked against the local SDK before publication. */
import { Composio } from '../src';

declare const composio: Composio;

async function instantContract(): Promise<void> {
  const session = await composio.create('user_123', {
    toolkits: ['exa'],
    instant: { toolkits: { enable: ['exa'] }, returnInstantCharge: true },
  });
  await composio.sessions.create('user_123', {
    toolkits: ['exa', 'firecrawl'],
    instant: {
      toolkits: { enable: ['exa'] },
      tools: { exa: { enable: ['EXA_SEARCH'] } },
    },
  });
  await session.update({ instant: false });
  await session.execute('EXA_SEARCH', {}, { account: 'instant_account' });
  if (session.config.instant) {
    const returnsCharge: boolean = session.config.instant.return_instant_charge;
    void returnsCharge;
  }

  const { items } = await session.listConfigHistory();
  const [historical] = items;
  if (historical?.config.instant) {
    const returnedCharge: boolean = historical.config.instant.return_instant_charge;
    void returnedCharge;
  }

  const summary = await composio.experimental.usage.summary();
  const charge: string = summary.instantCharge;
  void charge;
  const log = await composio.logs.get('log_1');
  const loggedCharge: string | undefined = log.metadata.instant_charge;
  void loggedCharge;
}

void instantContract;
