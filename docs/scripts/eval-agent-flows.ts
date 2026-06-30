#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';

const DEFAULT_LOCAL_FLOWS = ['gateway', 'mercury'] as const;
const EVE_BIN = process.env.EVE_BIN ?? './node_modules/.bin/eve';
const extraArgs = process.argv.slice(2);

type EvalRun = {
  name: string;
  env?: Record<string, string>;
  url?: string;
};

const parseList = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map(item => item.trim())
    .filter(Boolean) ?? [];

const parseRemoteTargets = (value: string | undefined): EvalRun[] =>
  parseList(value).map(entry => {
    const separator = entry.indexOf('=');
    if (separator === -1) {
      throw new Error(
        `Invalid DOCS_AGENT_EVAL_TARGETS entry "${entry}". Use name=https://deployment.example.`
      );
    }

    const name = entry.slice(0, separator).trim();
    const url = entry.slice(separator + 1).trim();

    if (!name || !url) {
      throw new Error(
        `Invalid DOCS_AGENT_EVAL_TARGETS entry "${entry}". Both name and URL are required.`
      );
    }

    return { name, url };
  });

const buildRuns = (): EvalRun[] => {
  const remoteTargets = parseRemoteTargets(process.env.DOCS_AGENT_EVAL_TARGETS);

  if (remoteTargets.length > 0) {
    return remoteTargets;
  }

  const flows = parseList(process.env.DOCS_AGENT_EVAL_FLOWS);
  const selectedFlows = flows.length > 0 ? flows : [...DEFAULT_LOCAL_FLOWS];

  return selectedFlows.map(flow => ({
    name: flow,
    env: { DOCS_AGENT_MODEL_FLOW: flow },
  }));
};

const warnForMissingCredentials = (run: EvalRun) => {
  const flow = run.env?.DOCS_AGENT_MODEL_FLOW;

  if (flow === 'mercury' && !process.env.INCEPTION_API_KEY) {
    console.warn(
      '[eval-agent-flows] INCEPTION_API_KEY is not set; Mercury evals will fail or skip model calls.'
    );
  }

  if (flow === 'gateway' && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.warn(
      '[eval-agent-flows] AI_GATEWAY_API_KEY/VERCEL_OIDC_TOKEN is not set; gateway evals will fail or skip model calls.'
    );
  }
};

const runEval = (run: EvalRun) => {
  const args = ['eval', 'docs-agent', '--skip-report'];

  if (run.url) {
    args.push('--url', run.url);
  }

  args.push(...extraArgs);

  console.log(`\n## ${run.url ? 'Remote target' : 'Local model flow'}: ${run.name}`);
  console.log(`$ ${EVE_BIN} ${args.join(' ')}`);
  warnForMissingCredentials(run);

  return (
    spawnSync(EVE_BIN, args, {
      env: { ...process.env, ...run.env },
      stdio: 'inherit',
    }).status ?? 1
  );
};

const runs = buildRuns();
let failed = 0;

for (const run of runs) {
  const status = runEval(run);
  if (status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${runs.length} docs-agent eval run(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${runs.length} docs-agent eval run(s) passed.`);
