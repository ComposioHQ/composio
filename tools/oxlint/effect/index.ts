import { eslintCompatPlugin } from '@oxlint/plugins';
import { noOrDieInServiceConstructionRule } from './rules/no-ordie-in-service-construction.ts';
import { requireCauseWhenNarrowingRule } from './rules/require-cause-when-narrowing.ts';

export default eslintCompatPlugin({
  meta: { name: 'composio-effect' },
  rules: {
    'require-cause-when-narrowing': requireCauseWhenNarrowingRule,
    'no-ordie-in-service-construction': noOrDieInServiceConstructionRule,
  },
});
