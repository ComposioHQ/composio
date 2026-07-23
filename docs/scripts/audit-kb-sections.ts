import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  inventoryPublicKb,
  renderAuditCsv,
  renderAuditMarkdown,
  type KbAuditCandidate,
  type KbAuditRow,
  type KbAuditState,
} from '@/lib/kb/audit';

const REQUIRED_COMMIT = '5eed614';
const DEFAULT_REASON =
  'Not selected for first-batch verification; compare this public support claim with current authoritative product or provider sources before publishing.';
const INCIDENT_REASON = 'Resolved incident guidance remains on the status/archive surface.';

type AuditDecision = Partial<
  Pick<
    KbAuditRow,
    | 'proposedTitle'
    | 'state'
    | 'reason'
    | 'existingUrl'
    | 'freshness'
    | 'verificationSource'
    | 'supportSignal'
    | 'priorityScore'
  >
>;

interface CliOptions {
  sourceRoot: string;
  decisions: string;
  outputDir: string;
}

function requiredOption(argumentsList: string[], flag: string): string {
  const index = argumentsList.indexOf(flag);
  const value = index >= 0 ? argumentsList[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`Missing required ${flag}`);
  return value;
}

function parseOptions(argumentsList: string[]): CliOptions {
  const allowed = new Set(['--source-root', '--decisions', '--output-dir']);
  for (const argument of argumentsList) {
    if (argument.startsWith('--') && !allowed.has(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  const sourceRoot = requiredOption(argumentsList, '--source-root');
  if (!isAbsolute(sourceRoot)) throw new Error('--source-root must be an absolute path');
  return {
    sourceRoot: resolve(sourceRoot),
    decisions: resolve(requiredOption(argumentsList, '--decisions')),
    outputDir: resolve(requiredOption(argumentsList, '--output-dir')),
  };
}

function isInside(directory: string, possibleChild: string): boolean {
  const path = relative(directory, possibleChild);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function resolveWithExistingAncestor(path: string): string {
  let ancestor = resolve(path);
  const missingSegments: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error(`Cannot resolve path: ${path}`);
    missingSegments.unshift(basename(ancestor));
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...missingSegments);
}

export function resolveAuditRoots(
  sourceRoot: string,
  outputDir: string,
): { sourceRoot: string; outputDir: string } {
  const resolvedSourceRoot = realpathSync(sourceRoot);
  const resolvedOutputDir = resolveWithExistingAncestor(outputDir);
  if (
    isInside(resolvedSourceRoot, resolvedOutputDir) ||
    isInside(resolvedOutputDir, resolvedSourceRoot)
  ) {
    throw new Error('--output-dir must not overlap --source-root');
  }
  return { sourceRoot: resolvedSourceRoot, outputDir: resolvedOutputDir };
}

export function assertExactRevision(head: string, required: string): void {
  if (head.trim() !== required.trim()) {
    throw new Error(`--source-root must be checked out at ${REQUIRED_COMMIT}`);
  }
}

function verifySourceCheckout(
  sourceRoot: string,
  outputDir: string,
): { sourceRoot: string; outputDir: string } {
  const roots = resolveAuditRoots(sourceRoot, outputDir);
  if (!statSync(roots.sourceRoot).isDirectory()) {
    throw new Error('--source-root must be a directory');
  }
  const head = execFileSync('git', ['-C', roots.sourceRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  const required = execFileSync(
    'git',
    ['-C', roots.sourceRoot, 'rev-parse', `${REQUIRED_COMMIT}^{commit}`],
    {
      encoding: 'utf8',
    },
  );
  assertExactRevision(head, required);
  return roots;
}

function isState(value: unknown): value is KbAuditState {
  return (
    value === 'publish' ||
    value === 'link-only' ||
    value === 'needs-verification' ||
    value === 'exclude'
  );
}

function readDecisions(decisionsPath: string): Map<string, AuditDecision> {
  const parsed: unknown = JSON.parse(readFileSync(decisionsPath, 'utf8'));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('--decisions must contain an object keyed by candidate ID');
  }
  const decisions = new Map<string, AuditDecision>();
  for (const [id, decision] of Object.entries(parsed)) {
    if (!decision || Array.isArray(decision) || typeof decision !== 'object') {
      throw new Error(`Decision for ${id} must be an object`);
    }
    const typedDecision = decision as AuditDecision;
    if (typedDecision.state !== undefined && !isState(typedDecision.state)) {
      throw new Error(`Decision for ${id} has an invalid state`);
    }
    decisions.set(id, typedDecision);
  }
  return decisions;
}

function defaultRow(candidate: KbAuditCandidate): KbAuditRow {
  const incident = candidate.sourcePath.startsWith('kb/incidents/');
  return {
    ...candidate,
    proposedTitle: candidate.heading ?? candidate.sourceTitle,
    state: incident ? 'exclude' : 'needs-verification',
    reason: incident ? INCIDENT_REASON : DEFAULT_REASON,
    existingUrl: '',
    freshness: '',
    verificationSource: '',
    supportSignal: '',
    priorityScore: 0,
  };
}

function buildRows(candidates: KbAuditCandidate[], decisions: Map<string, AuditDecision>): KbAuditRow[] {
  return candidates.map((candidate) => ({ ...defaultRow(candidate), ...decisions.get(candidate.id) }));
}

function auditFilePrefix(decisionsPath: string): string {
  const filename = basename(decisionsPath);
  return filename.endsWith('-decisions.json')
    ? filename.slice(0, -'-decisions.json'.length)
    : 'kb-audit';
}

export function runAudit(options: CliOptions): void {
  const roots = verifySourceCheckout(options.sourceRoot, options.outputDir);
  const inventory = inventoryPublicKb(roots.sourceRoot);
  const rows = buildRows(inventory.candidates, readDecisions(options.decisions));
  const prefix = auditFilePrefix(options.decisions);
  mkdirSync(roots.outputDir, { recursive: true });
  writeFileSync(resolve(roots.outputDir, `${prefix}-section-audit.csv`), renderAuditCsv(rows));
  writeFileSync(
    resolve(roots.outputDir, `${prefix}-content-gap-audit.md`),
    renderAuditMarkdown(inventory, rows),
  );
  console.log(
    `${inventory.fileCount} public files, ${inventory.levelTwoSectionCount} level-two sections, ${inventory.bodyOnlyFileCount} body-only candidates`,
  );
}

if (import.meta.main) {
  try {
    runAudit(parseOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
