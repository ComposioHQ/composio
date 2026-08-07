#!/usr/bin/env bun

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DOCS_BENCHMARK_SCENARIOS, type DocsBenchmarkScenario } from '../evals/docs-benchmark/scenarios';

const EVE_BIN = process.env.EVE_BIN ?? './node_modules/.bin/eve';
const DEFAULT_BEFORE = 'https://docs.composio.dev';
const CITATION_PATTERN = /\[[^\]]+\]\((?:https?:\/\/[^/)]+)?\/(?:docs|examples|reference)(?:\/[^)#\s]+)?(?:#[^)\s]+)?\)/i;

interface CliOptions {
  before: string;
  after?: string;
  trials: number;
  maxConcurrency: number;
  output: string;
  fromResults?: string;
  skipSiteAudit: boolean;
  siteOnly: boolean;
}

interface EveToolCall {
  status: string;
}

interface EveResult {
  id: string;
  result: {
    finalMessage: string | null;
    status: string;
    derived: {
      toolCallCount: number;
      toolCalls: EveToolCall[];
    };
    runtimeIdentity?: {
      modelId?: string;
      build?: { gitSha?: string };
    };
  };
  verdict: string;
  error?: string;
  startedAt: string;
  completedAt: string;
}

interface ScenarioScore {
  target: string;
  trial: number;
  scenarioId: string;
  title: string;
  category: string;
  execution: number;
  content: number;
  route: number;
  citation: number | null;
  efficiency: number;
  overall: number;
  toolCalls: number;
  latencyMs: number;
  matchedRoutes: string[];
  forbiddenRoutes: string[];
  missingContent: string[];
  finalMessage: string;
  error?: string;
  runtimeModel?: string;
  runtimeGitSha?: string;
}

interface SiteSurface {
  status: number;
  bytes: number;
}

interface RouteAudit {
  route: string;
  markdownStatus: number;
  inSitemap: boolean;
  inLlms: boolean;
  navigationDepth: number | null;
}

interface QuickstartAudit {
  pythonBlocks: number;
  compilingBlocks: number;
  syntaxPasses: number;
  syntaxErrors: string[];
  hasInstallCommand: boolean;
  hasApiKeySetup: boolean;
  liveExecution: 'not-run';
}

interface SiteAudit {
  target: string;
  surfaces: Record<string, SiteSurface>;
  sitemapUrls: number;
  llmsUrls: number;
  llmsFullBytes: number;
  scenarioRoutes: RouteAudit[];
  routeAvailability: number;
  sitemapCoverage: number;
  llmsCoverage: number;
  navigationReachability: number;
  medianNavigationDepth: number | null;
  quickstart: QuickstartAudit;
}

const parsePositiveInt = (raw: string | undefined, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return value;
};

const parseArgs = (args: string[]): CliOptions => {
  const options: CliOptions = {
    before: DEFAULT_BEFORE,
    trials: 1,
    maxConcurrency: 2,
    output: `evals/results/${new Date().toISOString().replace(/[:.]/g, '-')}`,
    skipSiteAudit: false,
    siteOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === '--before') {
      if (!value) throw new Error(`${flag} requires a URL.`);
      options.before = value;
      index += 1;
    } else if (flag === '--after') {
      if (!value) throw new Error(`${flag} requires a URL.`);
      options.after = value;
      index += 1;
    } else if (flag === '--trials') {
      options.trials = parsePositiveInt(value, flag);
      index += 1;
    } else if (flag === '--max-concurrency') {
      options.maxConcurrency = parsePositiveInt(value, flag);
      index += 1;
    } else if (flag === '--output') {
      if (!value) throw new Error(`${flag} requires a path.`);
      options.output = value;
      index += 1;
    } else if (flag === '--from-results') {
      if (!value) throw new Error(`${flag} requires a results.json path.`);
      options.fromResults = value;
      index += 1;
    } else if (flag === '--skip-site-audit') {
      options.skipSiteAudit = true;
    } else if (flag === '--site-only') {
      options.siteOnly = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
  }

  if (!options.after && !options.fromResults) {
    throw new Error('Pass the current preview with --after https://preview.example.');
  }

  return options;
};

const normalizeBase = (value: string): string => value.replace(/\/$/, '');

const routeAppears = (message: string, route: string): boolean => {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?![a-z0-9/_-])`, 'i').test(message);
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const percentage = (value: number): string => `${(value * 100).toFixed(1)}%`;

const runCommand = async (
  command: string,
  args: string[],
  input?: string
): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdin.end(input);
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      resolveRun({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });

const scenarioIndexFromEvalId = (evalId: string): number => {
  const suffix = evalId.match(/\/(\d+)$/)?.[1];
  if (suffix === undefined) throw new Error(`Cannot map eval id to scenario: ${evalId}`);
  return Number(suffix);
};

const scoreResult = (
  result: EveResult,
  scenario: DocsBenchmarkScenario,
  target: string,
  trial: number
): ScenarioScore => {
  const message = result.result.finalMessage ?? '';
  const matchedRoutes = scenario.expectedRoutes.filter(route => routeAppears(message, route));
  const forbiddenRoutes = (scenario.forbiddenRoutes ?? []).filter(route => routeAppears(message, route));
  const missingContent = scenario.expectedContent
    .filter(pattern => !pattern.test(message))
    .map(pattern => pattern.source);
  const execution =
    result.verdict !== 'failed' &&
    result.result.status !== 'failed' &&
    !result.result.derived.toolCalls.some(call => call.status === 'failed')
      ? 1
      : 0;
  const content =
    scenario.expectedContent.length === 0
      ? 1
      : (scenario.expectedContent.length - missingContent.length) / scenario.expectedContent.length;
  const route =
    (scenario.expectedRoutes.length === 0 || matchedRoutes.length > 0) && forbiddenRoutes.length === 0
      ? 1
      : 0;
  const citation = scenario.citation === false ? null : CITATION_PATTERN.test(message) ? 1 : 0;
  const efficiency = result.result.derived.toolCallCount <= (scenario.maxToolCalls ?? 3) ? 1 : 0;
  const dimensions = [execution, content, route, efficiency];
  if (citation !== null) dimensions.push(citation);

  return {
    target,
    trial,
    scenarioId: scenario.id,
    title: scenario.title,
    category: scenario.category,
    execution,
    content,
    route,
    citation,
    efficiency,
    overall: mean(dimensions),
    toolCalls: result.result.derived.toolCallCount,
    latencyMs: new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime(),
    matchedRoutes,
    forbiddenRoutes,
    missingContent,
    finalMessage: message,
    error: result.error,
    runtimeModel: result.result.runtimeIdentity?.modelId,
    runtimeGitSha: result.result.runtimeIdentity?.build?.gitSha,
  };
};

const rescoreSavedResult = (
  saved: ScenarioScore,
  scenario: DocsBenchmarkScenario
): ScenarioScore => {
  const matchedRoutes = scenario.expectedRoutes.filter(route => routeAppears(saved.finalMessage, route));
  const forbiddenRoutes = (scenario.forbiddenRoutes ?? []).filter(route =>
    routeAppears(saved.finalMessage, route)
  );
  const missingContent = scenario.expectedContent
    .filter(pattern => !pattern.test(saved.finalMessage))
    .map(pattern => pattern.source);
  const content =
    scenario.expectedContent.length === 0
      ? 1
      : (scenario.expectedContent.length - missingContent.length) / scenario.expectedContent.length;
  const route =
    (scenario.expectedRoutes.length === 0 || matchedRoutes.length > 0) && forbiddenRoutes.length === 0
      ? 1
      : 0;
  const citation = scenario.citation === false ? null : CITATION_PATTERN.test(saved.finalMessage) ? 1 : 0;
  const efficiency = saved.toolCalls <= (scenario.maxToolCalls ?? 3) ? 1 : 0;
  const dimensions = [saved.execution, content, route, efficiency];
  if (citation !== null) dimensions.push(citation);

  return {
    ...saved,
    content,
    route,
    citation,
    efficiency,
    overall: mean(dimensions),
    matchedRoutes,
    forbiddenRoutes,
    missingContent,
  };
};

const runModelTrial = async (
  targetName: string,
  targetUrl: string,
  trial: number,
  maxConcurrency: number
): Promise<ScenarioScore[]> => {
  console.log(`[model] ${targetName} trial ${trial}: ${targetUrl}`);
  const artifactsRoot = resolve('.eve/evals');
  await mkdir(artifactsRoot, { recursive: true });
  const beforeArtifacts = new Set(await readdir(artifactsRoot));
  const command = await runCommand(EVE_BIN, [
    'eval',
    'docs-benchmark',
    '--url',
    targetUrl,
    '--skip-report',
    '--max-concurrency',
    String(maxConcurrency),
  ]);

  const newArtifacts = (await readdir(artifactsRoot))
    .filter(name => !beforeArtifacts.has(name))
    .sort();
  const artifactName = newArtifacts.at(-1);
  if (!artifactName) {
    throw new Error(
      `Eve produced no artifact directory for ${targetName} trial ${trial}.\n${command.stderr || command.stdout}`
    );
  }
  const artifactRoot = join(artifactsRoot, artifactName);
  const results = await Promise.all(
    DOCS_BENCHMARK_SCENARIOS.map(async (_, index) => {
      const suffix = String(index).padStart(4, '0');
      const evalRoot = join(artifactRoot, 'evals/docs-benchmark/benchmark');
      const result = JSON.parse(await readFile(join(evalRoot, `${suffix}.json`), 'utf8')) as EveResult;
      const events = (await readFile(join(evalRoot, `${suffix}.events.ndjson`), 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as { type: string; data?: { runtime?: EveResult['result']['runtimeIdentity'] }; meta?: { at?: string } });
      const times = events.flatMap(event => (event.meta?.at ? [event.meta.at] : []));
      const runtimeIdentity = events.find(event => event.type === 'session.started')?.data?.runtime;
      result.startedAt = times[0] ?? artifactName;
      result.completedAt = times.at(-1) ?? result.startedAt;
      result.result.runtimeIdentity = runtimeIdentity;
      return result;
    })
  );

  if (results.length !== DOCS_BENCHMARK_SCENARIOS.length) {
    throw new Error(
      `${targetName} trial ${trial} returned ${results.length} results; expected ${DOCS_BENCHMARK_SCENARIOS.length}.`
    );
  }

  if (command.code !== 0) {
    console.warn(`[model] ${targetName} trial ${trial} contained failed execution gates.`);
  }

  return results.map(result => {
    const scenario = DOCS_BENCHMARK_SCENARIOS[scenarioIndexFromEvalId(result.id)];
    if (!scenario) throw new Error(`No scenario for ${result.id}`);
    return scoreResult(result, scenario, targetName, trial);
  });
};

const fetchSurface = async (baseUrl: string, path: string): Promise<{ response: Response; text: string }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'user-agent': 'composio-docs-benchmark/1.0' },
    redirect: 'follow',
  });
  return { response, text: await response.text() };
};

const extractMarkdownRoutes = (markdown: string): string[] => {
  const routes = new Set<string>();
  for (const match of markdown.matchAll(/\]\((\/(?:docs|examples|reference)(?:\/[^)#?\s]*)?)(?:#[^)]*)?\)/g)) {
    routes.add(match[1].replace(/\/$/, '') || '/docs');
  }
  return [...routes];
};

const extractUrlRoutes = (text: string): string[] => {
  const routes = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^/\s<]+(\/(?:docs|examples|reference)(?:\/[^\s<]*)?)/g)) {
    const route = match[1].replace(/\.md(?:#[^\s<]*)?$/, '').replace(/[),.;]+$/, '').replace(/\/$/, '');
    routes.add(route || '/docs');
  }
  return [...routes];
};

const mapLimit = async <T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const shortestDepths = (graph: Map<string, string[]>, start: string): Map<string, number> => {
  const depths = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const route = queue[index];
    const depth = depths.get(route) ?? 0;
    for (const next of graph.get(route) ?? []) {
      if (!depths.has(next)) {
        depths.set(next, depth + 1);
        queue.push(next);
      }
    }
  }
  return depths;
};

const auditQuickstart = async (markdown: string): Promise<QuickstartAudit> => {
  const pythonBlocks = [...markdown.matchAll(/```python\s*\n([\s\S]*?)```/g)].map(match => match[1].trim());
  const compilingBlocks = pythonBlocks.filter(block => block.length > 0 && !/^\.\.\.$/m.test(block));
  const syntaxErrors: string[] = [];

  // Python compiles source but never imports packages or executes calls.
  for (const [index, block] of compilingBlocks.entries()) {
    const process = await runCommand(
      'python3',
      ['-c', 'import sys; compile(sys.stdin.read(), "<quickstart>", "exec")'],
      block
    );
    if (process.code !== 0) syntaxErrors.push(`block ${index + 1}: ${process.stderr.trim()}`);
  }

  return {
    pythonBlocks: pythonBlocks.length,
    compilingBlocks: compilingBlocks.length,
    syntaxPasses: compilingBlocks.length - syntaxErrors.length,
    syntaxErrors,
    hasInstallCommand: /(?:pip|uv)\s+install|uv\s+add/i.test(markdown),
    hasApiKeySetup: /COMPOSIO_API_KEY/.test(markdown),
    liveExecution: 'not-run',
  };
};

const auditSite = async (targetName: string, rawBaseUrl: string): Promise<SiteAudit> => {
  const baseUrl = normalizeBase(rawBaseUrl);
  console.log(`[site] ${targetName}: ${baseUrl}`);
  const paths = ['/docs', '/docs.md', '/llms.txt', '/llms-full.txt', '/sitemap.xml'];
  const entries = await Promise.all(paths.map(async path => [path, await fetchSurface(baseUrl, path)] as const));
  const fetched = new Map(entries);
  const surfaces = Object.fromEntries(
    entries.map(([path, value]) => [path, { status: value.response.status, bytes: value.text.length }])
  );
  const llmsText = fetched.get('/llms.txt')?.text ?? '';
  const llmsFullText = fetched.get('/llms-full.txt')?.text ?? '';
  const sitemapText = fetched.get('/sitemap.xml')?.text ?? '';
  const llmsRoutes = new Set(extractUrlRoutes(llmsText));
  const sitemapRoutes = new Set(extractUrlRoutes(sitemapText));
  const contentRoutes = [...llmsRoutes].filter(route => route.startsWith('/docs') || route.startsWith('/examples'));
  if (!contentRoutes.includes('/docs')) contentRoutes.unshift('/docs');

  const graph = new Map<string, string[]>();
  const routeStatuses = new Map<string, number>();
  await mapLimit(contentRoutes, 10, async route => {
    const markdownPath = route === '/docs' ? '/docs.md' : `${route}.md`;
    const existing = fetched.get(markdownPath);
    const value = existing ?? (await fetchSurface(baseUrl, markdownPath));
    routeStatuses.set(route, value.response.status);
    graph.set(route, value.response.ok ? extractMarkdownRoutes(value.text) : []);
  });

  const scenarioRoutes = [
    ...new Set(DOCS_BENCHMARK_SCENARIOS.flatMap(scenario => scenario.expectedRoutes)),
  ];
  await mapLimit(
    scenarioRoutes.filter(route => !routeStatuses.has(route)),
    10,
    async route => {
      const value = await fetchSurface(baseUrl, route === '/docs' ? '/docs.md' : `${route}.md`);
      routeStatuses.set(route, value.response.status);
      graph.set(route, value.response.ok ? extractMarkdownRoutes(value.text) : []);
    }
  );

  const depths = shortestDepths(graph, '/docs');
  const routeAudits = scenarioRoutes.map(route => ({
    route,
    markdownStatus: routeStatuses.get(route) ?? 0,
    inSitemap: sitemapRoutes.has(route),
    inLlms: llmsRoutes.has(route),
    navigationDepth: depths.get(route) ?? null,
  }));
  const reachableDepths = routeAudits
    .map(route => route.navigationDepth)
    .filter((depth): depth is number => depth !== null);
  const quickstartMarkdown = graph.has('/docs/quickstart')
    ? (await fetchSurface(baseUrl, '/docs/quickstart.md')).text
    : '';

  return {
    target: targetName,
    surfaces,
    sitemapUrls: sitemapRoutes.size,
    llmsUrls: llmsRoutes.size,
    llmsFullBytes: llmsFullText.length,
    scenarioRoutes: routeAudits,
    routeAvailability: mean(routeAudits.map(route => (route.markdownStatus === 200 ? 1 : 0))),
    sitemapCoverage: mean(routeAudits.map(route => (route.inSitemap ? 1 : 0))),
    llmsCoverage: mean(routeAudits.map(route => (route.inLlms ? 1 : 0))),
    navigationReachability: mean(routeAudits.map(route => (route.navigationDepth === null ? 0 : 1))),
    medianNavigationDepth: median(reachableDepths),
    quickstart: await auditQuickstart(quickstartMarkdown),
  };
};

const aggregateDimensions = (scores: ScenarioScore[]) => ({
  execution: mean(scores.map(score => score.execution)),
  content: mean(scores.map(score => score.content)),
  route: mean(scores.map(score => score.route)),
  citation: mean(scores.flatMap(score => (score.citation === null ? [] : [score.citation]))),
  efficiency: mean(scores.map(score => score.efficiency)),
  overall: mean(scores.map(score => score.overall)),
  toolCalls: mean(scores.map(score => score.toolCalls)),
  latencyMs: mean(scores.map(score => score.latencyMs)),
});

const renderReport = (
  options: CliOptions,
  scores: ScenarioScore[],
  siteAudits: SiteAudit[]
): string => {
  const targets = ['before', 'after'];
  const aggregates = Object.fromEntries(
    targets.map(target => [target, aggregateDimensions(scores.filter(score => score.target === target))])
  );
  const lines = [
    '# Composio docs before/after benchmark',
    '',
    `- Before: ${options.before}`,
    `- After: ${options.after}`,
    `- Scenarios: ${DOCS_BENCHMARK_SCENARIOS.length}`,
    `- Trials per target: ${options.siteOnly ? 0 : options.trials}`,
    `- Model scenario executions: ${scores.length}`,
  ];

  if (scores.length > 0) {
    lines.push(
      '',
      `- Before runtime: ${[...new Set(scores.filter(score => score.target === 'before').map(score => `${score.runtimeModel ?? 'unknown'} @ ${score.runtimeGitSha ?? 'unknown'}`))].join(', ')}`,
      `- After runtime: ${[...new Set(scores.filter(score => score.target === 'after').map(score => `${score.runtimeModel ?? 'unknown'} @ ${score.runtimeGitSha ?? 'unknown'}`))].join(', ')}`,
      '',
      '## Model scores',
      '',
      '| Dimension | Before | After | Delta |',
      '| --- | ---: | ---: | ---: |'
    );

    for (const dimension of ['execution', 'content', 'route', 'citation', 'efficiency', 'overall'] as const) {
      const before = aggregates.before[dimension];
      const after = aggregates.after[dimension];
      lines.push(`| ${dimension} | ${percentage(before)} | ${percentage(after)} | ${percentage(after - before)} |`);
    }
    lines.push(
      `| average tool calls | ${aggregates.before.toolCalls.toFixed(2)} | ${aggregates.after.toolCalls.toFixed(2)} | ${(aggregates.after.toolCalls - aggregates.before.toolCalls).toFixed(2)} |`,
      `| average latency | ${(aggregates.before.latencyMs / 1000).toFixed(1)}s | ${(aggregates.after.latencyMs / 1000).toFixed(1)}s | ${((aggregates.after.latencyMs - aggregates.before.latencyMs) / 1000).toFixed(1)}s |`,
      '',
      '## Scenario results',
      '',
      '| Scenario | Category | Before | After | Route before/after |',
      '| --- | --- | ---: | ---: | ---: |'
    );

    for (const scenario of DOCS_BENCHMARK_SCENARIOS) {
      const before = scores.filter(score => score.target === 'before' && score.scenarioId === scenario.id);
      const after = scores.filter(score => score.target === 'after' && score.scenarioId === scenario.id);
      lines.push(
        `| ${scenario.title} | ${scenario.category} | ${percentage(mean(before.map(score => score.overall)))} | ${percentage(mean(after.map(score => score.overall)))} | ${percentage(mean(before.map(score => score.route)))} / ${percentage(mean(after.map(score => score.route)))} |`
      );
    }
  }

  if (siteAudits.length > 0) {
    lines.push(
      '',
      '## Crawl, corpus, and navigation audit',
      '',
      'Navigation depth is calculated from links in page content Markdown, excluding the global sidebar.',
      '',
      '| Metric | Before | After |',
      '| --- | ---: | ---: |'
    );
    const before = siteAudits.find(audit => audit.target === 'before');
    const after = siteAudits.find(audit => audit.target === 'after');
    if (before && after) {
      lines.push(
        `| scenario route availability | ${percentage(before.routeAvailability)} | ${percentage(after.routeAvailability)} |`,
        `| scenario routes in sitemap | ${percentage(before.sitemapCoverage)} | ${percentage(after.sitemapCoverage)} |`,
        `| scenario routes in llms.txt | ${percentage(before.llmsCoverage)} | ${percentage(after.llmsCoverage)} |`,
        `| reachable from Welcome content | ${percentage(before.navigationReachability)} | ${percentage(after.navigationReachability)} |`,
        `| median content-link depth | ${before.medianNavigationDepth ?? 'n/a'} | ${after.medianNavigationDepth ?? 'n/a'} |`,
        `| llms-full.txt bytes | ${before.llmsFullBytes.toLocaleString()} | ${after.llmsFullBytes.toLocaleString()} |`,
        `| Quickstart Python syntax | ${before.quickstart.syntaxPasses}/${before.quickstart.compilingBlocks} | ${after.quickstart.syntaxPasses}/${after.quickstart.compilingBlocks} |`
      );
    }
  }

  const failures = scores.filter(
    score => score.execution < 1 || score.content < 1 || score.route < 1 || score.citation === 0 || score.efficiency < 1
  );
  lines.push(
    '',
    '## Review notes',
    '',
    `- Dimension failures across all trials: ${failures.length}`,
    '- Full final answers and failure reasons are in `results.json`.',
    '- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.',
    '- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.',
    ''
  );
  return lines.join('\n');
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.fromResults) {
    const saved = JSON.parse(await readFile(resolve(options.fromResults), 'utf8')) as {
      config: CliOptions;
      siteAudits: SiteAudit[];
      scores: ScenarioScore[];
    };
    options.before = saved.config.before;
    options.after = saved.config.after;
    options.trials = saved.config.trials;
    const rescored = saved.scores.map(score => {
      const scenario = DOCS_BENCHMARK_SCENARIOS.find(row => row.id === score.scenarioId);
      if (!scenario) throw new Error(`Unknown saved scenario: ${score.scenarioId}`);
      return rescoreSavedResult(score, scenario);
    });
    const outputDirectory = resolve(options.output);
    await mkdir(outputDirectory, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      config: options,
      scenarios: DOCS_BENCHMARK_SCENARIOS.map(scenario => ({
        ...scenario,
        expectedContent: scenario.expectedContent.map(pattern => pattern.source),
      })),
      siteAudits: saved.siteAudits,
      scores: rescored,
    };
    await Promise.all([
      writeFile(resolve(outputDirectory, 'results.json'), `${JSON.stringify(payload, null, 2)}\n`),
      writeFile(resolve(outputDirectory, 'report.md'), renderReport(options, rescored, saved.siteAudits)),
    ]);
    console.log(`Regraded ${resolve(outputDirectory, 'report.md')}`);
    return;
  }
  options.before = normalizeBase(options.before);
  const after = normalizeBase(options.after!);
  options.after = after;
  const outputDirectory = resolve(options.output);
  await mkdir(outputDirectory, { recursive: true });

  const targets = [
    { name: 'before', url: options.before },
    { name: 'after', url: after },
  ];
  const siteAudits = options.skipSiteAudit
    ? []
    : await Promise.all(targets.map(target => auditSite(target.name, target.url)));

  const scores: ScenarioScore[] = [];
  if (!options.siteOnly) {
    for (let trial = 1; trial <= options.trials; trial += 1) {
      for (const target of targets) {
        scores.push(
          ...(await runModelTrial(target.name, target.url, trial, options.maxConcurrency))
        );
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    config: options,
    scenarios: DOCS_BENCHMARK_SCENARIOS.map(scenario => ({
      ...scenario,
      expectedContent: scenario.expectedContent.map(pattern => pattern.source),
    })),
    siteAudits,
    scores,
  };
  const report = renderReport(options, scores, siteAudits);
  await Promise.all([
    writeFile(resolve(outputDirectory, 'results.json'), `${JSON.stringify(payload, null, 2)}\n`),
    writeFile(resolve(outputDirectory, 'report.md'), report),
  ]);
  console.log(`Wrote ${resolve(outputDirectory, 'report.md')}`);
};

await main();
