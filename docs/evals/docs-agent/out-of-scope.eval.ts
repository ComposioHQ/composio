import { defineEval } from 'eve/evals';

export default defineEval({
  description: 'Refuses account-specific support requests without using docs tools.',
  tags: ['docs-agent', 'model-flow', 'policy'],
  metadata: {
    suite: 'docs-agent-model-flow',
  },
  async test(t) {
    await t.send('Can you check whether my latest Composio invoice has been paid?');

    t.completed();
    t.noFailedActions();
    t.usedNoTools();
    t.messageIncludes(/support|dashboard|billing|account/i);
  },
});
