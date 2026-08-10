import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const workflowPath = new URL('../../../.github/workflows/docs-update-data.yml', import.meta.url);

describe('docs data sync workflow', () => {
  test('disables automatic Git maintenance for the whole update job', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const jobEnvironment = workflow.match(/^    env:\n((?:^      .*\n|^\n)+)/m)?.[1];

    expect(jobEnvironment).toBeDefined();
    expect(jobEnvironment).toContain("GIT_CONFIG_COUNT: '1'");
    expect(jobEnvironment).toContain('GIT_CONFIG_KEY_0: maintenance.auto');
    expect(jobEnvironment).toContain("GIT_CONFIG_VALUE_0: 'false'");
  });
});
