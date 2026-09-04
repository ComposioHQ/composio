import { describe, expect, it } from 'bun:test';
import {
  buildCompatibilityPlan,
  discoverProviderCases,
  parseCliOptions,
} from '../ts/scripts/check-provider-compatibility';

describe('provider compatibility plan', () => {
  it('covers every provider at the workspace, verified minimum, and beta boundaries', async () => {
    const providers = await discoverProviderCases();
    const plan = buildCompatibilityPlan(providers, '1.0.0-beta.0');
    const providerNames = providers.map(provider => provider.name);
    const current = plan.find(lane => lane.id === 'workspace-current');
    const beta = plan.find(lane => lane.id === 'workspace-major-prerelease');
    const minimum = plan.filter(lane => lane.id.startsWith('verified-minimum-core-'));

    expect(providerNames).toHaveLength(10);
    expect(current?.providerNames).toEqual(providerNames);
    expect(beta?.providerNames).toEqual(providerNames);
    expect(beta?.core).toEqual({ kind: 'workspace-prerelease', version: '1.0.0-beta.0' });
    expect(minimum.flatMap(lane => lane.providerNames).sort()).toEqual([...providerNames].sort());
    expect(minimum).toHaveLength(10);
    expect(
      Object.fromEntries(
        minimum.map(lane => [
          lane.providerNames[0],
          lane.core.kind === 'registry' && lane.core.specifier,
        ])
      )
    ).toEqual({
      '@composio/anthropic': '0.14.0',
      '@composio/claude-agent-sdk': '0.11.0',
      '@composio/cloudflare': '0.14.0',
      '@composio/google': '0.16.0',
      '@composio/langchain': '0.11.0',
      '@composio/llamaindex': '0.11.0',
      '@composio/mastra': '0.18.0',
      '@composio/openai': '0.18.0',
      '@composio/openai-agents': '0.18.0',
      '@composio/vercel': '0.18.0',
    });
    expect(minimum.every(lane => lane.providerNames.length === 1)).toBe(true);
    expect(
      Object.fromEntries(
        providers.map(provider => [provider.name, provider.advertisedMinimumCoreVersion])
      )
    ).toEqual({
      '@composio/anthropic': '0.10.0',
      '@composio/claude-agent-sdk': '0.10.0',
      '@composio/cloudflare': '0.10.0',
      '@composio/google': '0.16.0',
      '@composio/langchain': '0.10.0',
      '@composio/llamaindex': '0.10.0',
      '@composio/mastra': '0.10.0',
      '@composio/openai': '0.10.0',
      '@composio/openai-agents': '0.10.0',
      '@composio/vercel': '0.10.0',
    });
  });

  it('selects all lanes by default and accepts focused runs', () => {
    expect([...parseCliOptions([]).lanes]).toEqual(['current', 'minimum', 'beta']);
    expect([...parseCliOptions(['--', '--lane', 'current', '--plan']).lanes]).toEqual(['current']);
    expect(parseCliOptions(['--', '--lane', 'current', '--plan']).planOnly).toBe(true);
    expect(() => parseCliOptions(['--lane', 'future'])).toThrow(
      '--lane must be current, minimum, or beta'
    );
    expect(() => parseCliOptions(['--unknown'])).toThrow('Unknown argument: --unknown');
  });
});
