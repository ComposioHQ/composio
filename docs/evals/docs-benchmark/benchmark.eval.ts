import { defineEval } from 'eve/evals';
import { DOCS_BENCHMARK_SCENARIOS } from './scenarios';

export default DOCS_BENCHMARK_SCENARIOS.map(scenario =>
  defineEval({
    description: scenario.title,
    tags: ['docs-benchmark', scenario.category],
    metadata: {
      scenarioId: scenario.id,
      category: scenario.category,
      prompt: scenario.prompt,
    },
    async test(t) {
      await t.send(scenario.prompt);

      // Keep execution safety as the only hard gate. The benchmark runner
      // scores content, routing, citations, and efficiency independently so
      // one weak dimension does not hide the others.
      t.succeeded();
      t.noFailedActions();
    },
  })
);
