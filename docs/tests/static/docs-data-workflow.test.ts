import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const workflowPath = resolve(process.cwd(), '..', '.github', 'workflows', 'docs-update-data.yml');

const workflowStepSchema = z
  .object({
    name: z.string().optional(),
    id: z.string().optional(),
    uses: z.string().optional(),
    if: z.string().optional(),
    'continue-on-error': z.boolean().optional(),
    'working-directory': z.string().optional(),
    env: z.record(z.string(), z.unknown()).optional(),
    with: z.record(z.string(), z.unknown()).optional(),
    run: z.string().optional(),
  })
  .passthrough();

const workflowSchema = z
  .object({
    jobs: z
      .record(
        z.string(),
        z
          .object({
            steps: z.array(workflowStepSchema).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

type WorkflowStep = z.infer<typeof workflowStepSchema>;

function workflowSteps(path: string, job: string): WorkflowStep[] {
  const workflow = workflowSchema.parse(Bun.YAML.parse(readFileSync(path, 'utf8')));
  return workflow.jobs?.[job]?.steps ?? [];
}

function stepNamed(steps: WorkflowStep[], name: string): WorkflowStep {
  const step = steps.find(candidate => candidate.name === name);
  expect(step, `Expected workflow step "${name}"`).toBeDefined();
  return step ?? {};
}

describe('docs data update workflow', () => {
  const steps = workflowSteps(workflowPath, 'update-data');

  test('keeps the release-bot token scoped to data sync and PR creation', () => {
    const appToken = stepNamed(steps, 'Generate GitHub App token');

    expect(appToken.with?.['permission-contents']).toBe('write');
    expect(appToken.with?.['permission-pull-requests']).toBe('write');
    expect(appToken.with).not.toHaveProperty('permission-issues');
  });

  test('uses the job token for all same-repository issue tracking', () => {
    const issueSteps = [
      'Open tracking issue on failure',
      'Close tracking issue on recovery',
      'Track KB freshness verifier health',
      'Track KB freshness findings',
    ];

    for (const name of issueSteps) {
      expect(stepNamed(steps, name).env?.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    }

    for (const step of steps.filter(candidate => candidate.run?.includes('gh issue'))) {
      expect(step.env?.GH_TOKEN).not.toBe('${{ steps.app-token.outputs.token }}');
    }
  });

  test('isolates the optional KB source path from every required data-sync step', () => {
    const sourceToken = stepNamed(steps, 'Generate read-only KB source token');
    expect(sourceToken['continue-on-error']).toBe(true);

    const requiredStepNames = [
      'Generate GitHub App token',
      'Checkout repository',
      'Generate toolkits data',
      'Fetch OpenAPI spec',
      'Generate API index pages',
      'Generate meta tools reference',
      'Create Pull Request',
    ];

    for (const name of requiredStepNames) {
      const step = stepNamed(steps, name);
      const dependencies = JSON.stringify({ if: step.if, env: step.env, with: step.with });
      expect(dependencies).not.toContain('steps.source-token');
      expect(dependencies).not.toContain('steps.verify-kb');
    }
  });

  test('keeps the generated-data pull request scope and target stable', () => {
    const createPullRequest = stepNamed(steps, 'Create Pull Request');
    const addPaths = String(createPullRequest.with?.['add-paths']);

    expect(createPullRequest.with?.branch).toBe('docs/auto-update-data');
    expect(createPullRequest.with?.base).toBe('next');
    for (const path of [
      'docs/public/data/',
      'docs/public/openapi.json',
      'docs/public/openapi-v3.json',
      'docs/public/openapi-webhooks.json',
      'docs/content/reference/api-reference/',
      'docs/content/reference/v3/api-reference/',
      'docs/content/toolkits/meta-tools/',
    ]) {
      expect(addPaths).toContain(path);
    }
  });

  test('opens failures before checkout and closes the issue after recovery', () => {
    const failure = stepNamed(steps, 'Open tracking issue on failure');
    const recovery = stepNamed(steps, 'Close tracking issue on recovery');

    expect(failure.if).toBe('failure()');
    expect(failure['working-directory']).toBe('${{ github.workspace }}');
    expect(failure.env?.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    expect(failure.env?.LABEL).toBe('docs-data-sync-failure');

    expect(recovery.if).toBe('success()');
    expect(recovery.env?.LABEL).toBe('docs-data-sync-failure');
    expect(recovery.run).toContain('gh issue list');
    expect(recovery.run).toContain('gh issue close');
    expect(recovery.run).toContain('${{ github.run_id }}');
  });
});
