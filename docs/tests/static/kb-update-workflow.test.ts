import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowPath = resolve(process.cwd(), '..', '.github', 'workflows', 'docs-update-kb.yml');
const dataWorkflowPath = resolve(
  process.cwd(),
  '..',
  '.github',
  'workflows',
  'docs-update-data.yml',
);
const importerPath = resolve(process.cwd(), 'scripts', 'import-support-knowledge.ts');

interface WorkflowStep {
  name?: string;
  if?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  run?: string;
}

function workflowSteps(path: string, job: string): WorkflowStep[] {
  const workflow = Bun.YAML.parse(readFileSync(path, 'utf8')) as {
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
  };
  return workflow.jobs?.[job]?.steps ?? [];
}

describe('support knowledge refresh workflow', () => {
  test('imports the private upstream and proposes every generated KB artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('repository: ComposioHQ/support-knowledge');
    expect(workflow).toContain('bun run import:kb');
    expect(workflow).toContain('bun run build:kb-semantic');
    expect(workflow).toContain('bun run verify:kb');
    expect(workflow).toContain('docs/kb/');
    expect(workflow).toContain('docs/content/kb/');
    expect(workflow).toContain('branch: docs/auto-update-kb');
    expect(workflow).toContain('base: next');
    expect(workflow).toContain('refresh:');
    expect(workflow).toContain('propose:');
    expect(workflow).toContain('needs: refresh');
    expect(workflow).toContain('id: upstream-token');
    expect(workflow).toContain('id: write-token');
    expect(workflow).toContain('permission-contents: read');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('actions/upload-artifact@');
    expect(workflow).toContain('actions/download-artifact@');
  });

  test('can refresh immediately or discover upstream changes on a schedule', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('support-knowledge-updated');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
  });

  test('downloads generated artifacts under the docs directory staged by the refresh PR', () => {
    const steps = workflowSteps(workflowPath, 'propose');
    const download = steps.find(step => step.name === 'Download verified KB artifacts');
    const createPullRequest = steps.find(step => step.name === 'Create refresh pull request');

    expect(download?.with?.path).toBe('docs');
    expect(String(createPullRequest?.with?.['add-paths'])).toContain('docs/kb/');
    expect(String(createPullRequest?.with?.['add-paths'])).toContain('docs/content/kb/');
  });

  test('treats keyword-only production retrieval as a semantic health failure', () => {
    const steps = workflowSteps(
      resolve(process.cwd(), '..', '.github', 'workflows', 'docs.health-check.yml'),
      'health-check',
    );
    const endpointCheck = steps.find(step => step.name === 'Check endpoints');

    expect(endpointCheck?.run).toContain('.mode == "hybrid"');
    expect(endpointCheck?.run).not.toContain('.mode == "keyword"');
  });

  test('gives the existing freshness sweep read access to the pinned upstream', () => {
    const workflow = readFileSync(dataWorkflowPath, 'utf8');

    expect(workflow).toContain('repositories: support-knowledge');
    expect(workflow).toContain('id: source-token');
    expect(workflow).toContain('GH_TOKEN: ${{ steps.source-token.outputs.token }}');
  });

  test('keeps verifier crashes separate from published-content freshness findings', () => {
    const steps = workflowSteps(dataWorkflowPath, 'update-data');
    const verifierHealth = steps.find(step => step.name === 'Track KB freshness verifier health');
    const freshnessFindings = steps.find(step => step.name === 'Track KB freshness findings');

    expect(verifierHealth?.if).toContain("steps.verify-kb.outputs.exit_code != ''");
    expect(verifierHealth?.env?.LABEL).toBe('kb-freshness-check-failure');
    expect(verifierHealth?.run).toContain('[ "$VERIFY_EXIT" = "0" ] || [ "$VERIFY_EXIT" = "1" ]');
    expect(freshnessFindings?.if).toContain("steps.verify-kb.outputs.exit_code == '0'");
    expect(freshnessFindings?.if).toContain("steps.verify-kb.outputs.exit_code == '1'");
    expect(freshnessFindings?.if).not.toContain("steps.verify-kb.outputs.exit_code != ''");
  });

  test('treats upstream files as data instead of executing upstream code', () => {
    const importer = readFileSync(importerPath, 'utf8');

    expect(importer).not.toContain('scripts/validate-kb.py');
    expect(importer).not.toContain("spawnSync('python3'");
  });
});
