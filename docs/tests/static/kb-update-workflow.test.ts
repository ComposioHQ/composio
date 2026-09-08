import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowPath = resolve(process.cwd(), '..', '.github', 'workflows', 'docs-update-kb.yml');
const semanticRefreshWorkflowPath = resolve(
  process.cwd(),
  '..',
  '.github',
  'workflows',
  'docs-rebuild-kb-semantic.yml',
);
const docsTestsWorkflowPath = resolve(
  process.cwd(),
  '..',
  '.github',
  'workflows',
  'docs-tests.yml',
);
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
  id?: string;
  if?: string;
  uses?: string;
  'continue-on-error'?: boolean;
  'working-directory'?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  run?: string;
}

interface WorkflowJob {
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  env?: Record<string, unknown>;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

function workflowSteps(path: string, job: string): WorkflowStep[] {
  const workflow = Bun.YAML.parse(readFileSync(path, 'utf8')) as {
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
  };
  return workflow.jobs?.[job]?.steps ?? [];
}

describe('support knowledge refresh workflow', () => {
  test('rebuilds stale semantic artifacts from default-branch code only for trusted current pull requests', () => {
    const workflow = existsSync(semanticRefreshWorkflowPath)
      ? Bun.YAML.parse(readFileSync(semanticRefreshWorkflowPath, 'utf8')) as {
          on?: {
            workflow_run?: { workflows?: string[]; types?: string[] };
            pull_request?: unknown;
            pull_request_target?: unknown;
          };
          permissions?: Record<string, string>;
          env?: Record<string, unknown>;
          jobs?: Record<string, WorkflowJob>;
        }
      : {};
    const authorize = workflow.jobs?.authorize;
    const authorizeStep = authorize?.steps?.find(
      step => step.name === 'Authorize originating pull request',
    );
    const rebuild = workflow.jobs?.rebuild;
    const steps = rebuild?.steps ?? [];
    const checkout = steps.find(step => step.name === 'Checkout pull request');
    const freshness = steps.find(step => step.name === 'Check semantic artifact freshness');
    const build = steps.find(step => step.name === 'Rebuild semantic artifact');
    const verify = steps.find(step => step.name === 'Verify rebuilt artifact');
    const writeToken = steps.find(step => step.name === 'Generate write token');
    const commit = steps.find(step => step.name === 'Commit rebuilt artifact');

    expect(workflow.on?.workflow_run?.workflows).toEqual(['Docs - Tests']);
    expect(workflow.on?.workflow_run?.types).toEqual(['completed']);
    expect(workflow.on).not.toHaveProperty('pull_request');
    expect(workflow.on).not.toHaveProperty('pull_request_target');
    expect(workflow.permissions?.contents).toBe('read');
    expect(workflow.env).toBeUndefined();

    expect(authorize?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(authorize?.outputs).toEqual({
      trusted: '${{ steps.trust.outputs.trusted }}',
      head_sha: '${{ steps.trust.outputs.head_sha }}',
      head_ref: '${{ steps.trust.outputs.head_ref }}',
    });
    expect(authorize?.env).toBeUndefined();
    expect(authorizeStep?.env).toEqual({
      GH_TOKEN: '${{ github.token }}',
      REPOSITORY: '${{ github.repository }}',
      RUN_ID: '${{ github.event.workflow_run.id }}',
    });
    expect(authorize?.steps?.map(step => step.name)).toEqual([
      'Authorize originating pull request',
    ]);
    expect(authorizeStep?.run?.trim()).toBe(`echo "trusted=false" >> "$GITHUB_OUTPUT"

run_json=$(gh api "repos/$REPOSITORY/actions/runs/$RUN_ID")
event_name=$(jq -r '.event' <<< "$run_json")
repository_id=$(jq -r '.repository.id' <<< "$run_json")
head_repository_id=$(jq -r '.head_repository.id // empty' <<< "$run_json")
head_branch=$(jq -r '.head_branch // empty' <<< "$run_json")
head_sha=$(jq -r '.head_sha // empty' <<< "$run_json")

if [ "$event_name" != "pull_request" ] ||
   [ -z "$head_repository_id" ] ||
   [ "$head_repository_id" != "$repository_id" ] ||
   [ -z "$head_branch" ] ||
   [ -z "$head_sha" ]; then
  echo "Skipping a non-pull-request or fork workflow run."
  exit 0
fi

pull_matches=$(jq -c \\
  --arg head_repository_id "$head_repository_id" \\
  --arg head_branch "$head_branch" \\
  --arg head_sha "$head_sha" \\
  '[
    (.pull_requests // [])[]
    | select(
        (.head.repo.id | tostring) == $head_repository_id and
        .head.ref == $head_branch and
        .head.sha == $head_sha
      )
  ]' <<< "$run_json")

if [ "$(jq 'length' <<< "$pull_matches")" != "1" ]; then
  echo "Skipping a workflow run without exactly one matching pull request."
  exit 0
fi

pull_number=$(jq -r '.[0].number' <<< "$pull_matches")
pull_json=$(gh api "repos/$REPOSITORY/pulls/$pull_number")
association=$(jq -r '.author_association' <<< "$pull_json")
live_head_repository_id=$(jq -r '.head.repo.id // empty' <<< "$pull_json")
live_head_sha=$(jq -r '.head.sha // empty' <<< "$pull_json")
live_head_ref=$(jq -r '.head.ref // empty' <<< "$pull_json")
state=$(jq -r '.state' <<< "$pull_json")

if [ "$state" != "open" ] ||
   [ "$live_head_repository_id" != "$repository_id" ] ||
   [ "$live_head_sha" != "$head_sha" ] ||
   [ "$live_head_ref" != "$head_branch" ]; then
  echo "Skipping a closed or stale pull request."
  exit 0
fi

case "$association" in
  MEMBER|OWNER) ;;
  *)
    echo "Skipping a pull request whose author is not a repository member or owner."
    exit 0
    ;;
esac

echo "trusted=true" >> "$GITHUB_OUTPUT"
echo "head_sha=$live_head_sha" >> "$GITHUB_OUTPUT"
echo "head_ref=$live_head_ref" >> "$GITHUB_OUTPUT"`);

    expect(rebuild?.needs).toBe('authorize');
    expect(rebuild?.if).toBe("needs.authorize.outputs.trusted == 'true'");
    expect(rebuild?.permissions?.contents).toBe('read');
    expect(rebuild?.env).toBeUndefined();
    expect(steps.map(step => step.name)).toEqual([
      'Checkout pull request',
      'Setup Node.js, pnpm, Bun',
      'Cache Bun dependencies',
      'Install dependencies',
      'Check semantic artifact freshness',
      'Rebuild semantic artifact',
      'Verify rebuilt artifact',
      'Generate write token',
      'Resolve bot identity',
      'Commit rebuilt artifact',
    ]);
    expect(checkout?.with?.ref).toBe('${{ needs.authorize.outputs.head_sha }}');
    expect(checkout?.with?.['persist-credentials']).toBe(false);
    expect(freshness?.['continue-on-error']).toBe(true);
    expect(build?.if).toBe("steps.freshness.outcome == 'failure'");
    expect(build?.env).toEqual({ OPENAI_API_KEY: '${{ secrets.OPENAI_API_KEY }}' });
    expect(verify?.if).toBe("steps.freshness.outcome == 'failure'");
    expect(writeToken?.if).toBe("steps.freshness.outcome == 'failure'");
    expect(writeToken?.with).toEqual({
      'client-id': '${{ vars.RELEASE_BOT_CLIENT_ID }}',
      'private-key': '${{ secrets.RELEASE_BOT_APP_PRIVATE_KEY }}',
      owner: 'ComposioHQ',
      repositories: 'composio',
      'permission-contents': 'write',
    });
    expect(commit?.if).toBe("steps.freshness.outcome == 'failure'");
    expect(commit?.env?.HEAD_REF).toBe('${{ needs.authorize.outputs.head_ref }}');
    expect(commit?.run).toContain('git push origin "HEAD:$HEAD_REF"');
    expect(commit?.run).not.toMatch(/git push[^\n]*(?:--force|\s-f(?:\s|$))/);
    expect(steps.indexOf(writeToken)).toBeGreaterThan(steps.indexOf(verify));

    expect(
      steps.filter(step => JSON.stringify(step).includes('secrets.OPENAI_API_KEY'))
        .map(step => step.name),
    ).toEqual(['Rebuild semantic artifact']);
    expect(
      steps.filter(step => JSON.stringify(step).includes('RELEASE_BOT_'))
        .map(step => step.name),
    ).toEqual(['Generate write token']);

    const allSteps = Object.values(workflow.jobs ?? {}).flatMap(job => job.steps ?? []);
    expect(
      allSteps.filter(step => JSON.stringify(step).includes('${{ secrets.'))
        .map(step => step.name),
    ).toEqual(['Rebuild semantic artifact', 'Generate write token']);

    const docsTestsWorkflow = Bun.YAML.parse(readFileSync(docsTestsWorkflowPath, 'utf8')) as {
      on?: { pull_request?: { paths?: string[] } };
    };
    expect(docsTestsWorkflow.on?.pull_request?.paths).toContain(
      '.github/workflows/docs-rebuild-kb-semantic.yml',
    );
  });

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

  test('passes dispatched source context to the tested resolver script', () => {
    const workflow = Bun.YAML.parse(readFileSync(workflowPath, 'utf8')) as {
      on?: {
        repository_dispatch?: { types?: string[] };
        workflow_dispatch?: unknown;
      };
      jobs?: Record<string, WorkflowJob>;
    };
    const steps = workflow.jobs?.refresh?.steps ?? [];
    const checkout = steps.find(step => step.name === 'Checkout support knowledge');
    const resolveSource = steps.find(step => step.name === 'Resolve upstream change');

    expect(workflow.on?.repository_dispatch?.types).toEqual(['support-knowledge-updated']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(checkout?.with?.ref).toBe(
      "${{ github.event_name == 'repository_dispatch' && github.event.client_payload.source_commit || 'main' }}",
    );
    expect(resolveSource?.env?.REQUESTED_SOURCE_COMMIT).toBe(
      "${{ github.event_name == 'repository_dispatch' && github.event.client_payload.source_commit || '' }}",
    );
    expect(resolveSource?.run).toBe('bash scripts/resolve-kb-refresh-source.sh');
  });

  test('serializes refreshes and checks complete upstream history', () => {
    const workflow = Bun.YAML.parse(readFileSync(workflowPath, 'utf8')) as {
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      jobs?: Record<string, WorkflowJob>;
    };
    const checkout = workflow.jobs?.refresh?.steps?.find(
      step => step.name === 'Checkout support knowledge',
    );

    expect(workflow.concurrency).toEqual({
      group: 'docs-support-knowledge-refresh',
      'cancel-in-progress': true,
    });
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  test('tracks failures until both refresh and PR proposal recover', () => {
    const workflow = Bun.YAML.parse(readFileSync(workflowPath, 'utf8')) as {
      jobs?: Record<string, WorkflowJob>;
    };
    const reporter = workflow.jobs?.report;
    const failure = reporter?.steps?.find(step => step.name === 'Open KB refresh failure issue');
    const recovery = reporter?.steps?.find(step => step.name === 'Close KB refresh failure issue');

    expect(reporter?.needs).toEqual(['refresh', 'propose']);
    expect(reporter?.if).toBe('always()');
    expect(reporter?.permissions?.issues).toBe('write');
    expect(failure?.if).toContain("needs.refresh.result == 'failure'");
    expect(failure?.if).toContain("needs.propose.result == 'failure'");
    expect(failure?.env?.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    expect(failure?.env?.LABEL).toBe('docs-kb-refresh-failure');
    expect(failure?.run).toContain('gh issue list');
    expect(failure?.run).toContain('gh issue create');
    expect(recovery?.if).toContain("needs.refresh.result == 'success'");
    expect(recovery?.if).toContain("needs.refresh.outputs.changed != 'true'");
    expect(recovery?.if).toContain("needs.propose.result == 'success'");
    expect(recovery?.env?.LABEL).toBe('docs-kb-refresh-failure');
    expect(recovery?.run).toContain('gh issue close');
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
