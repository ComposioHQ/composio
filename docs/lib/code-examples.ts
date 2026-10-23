/**
 * Inventories rendered examples using the same Markdown/MDX grammar as the site.
 * Exemptions attach only to adjacent syntax nodes, never text inside code or strings.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { toString } from 'mdast-util-to-string';
import { FILE_BUILDS } from './file-builds';
import { EXAMPLE_SOURCES, EXAMPLE_SOURCE_REASONS, EXAMPLE_BUILD_SOURCES } from './example-sources';
import { z } from 'zod';
import { SESSION_GUARDRAILS, DIRECT_EXECUTION_GUARDRAILS } from './llm-guardrails';
import { apiCodeUsages } from './api-code-usages';
import { attributeValue, markdownLanguageGroups, parseExampleDocument, type ExampleNode } from './example-document';

export type CodeExampleRule =
  | 'language-items'
  | 'language-empty-tab'
  | 'language-cross-fence'
  | 'standalone-sdk-fence'
  | 'standalone-api-fence'
  | 'marker-invalid'
  | 'api-missing'
  | 'example-syntax'
  | 'external-example';

export type CodeExampleViolation = { path: string; line: number; rule: CodeExampleRule; message: string };
export type CodeExampleFile = { path: string; source: string };

export type MarkerUnit = {
  type: 'marker';
  line: number;
  form: 'mdx' | 'html';
  kind: string | undefined;
  reason: string | undefined;
  wellFormed: boolean;
  api?: { rule: string; operation: string; field?: string };
};

export type FenceUnit = {
  type: 'fence';
  line: number;
  lang: string;
  info: string;
  code: string;
  markers: MarkerUnit[];
};

export type ComponentUnit = {
  type: 'package-install' | 'callout' | 'table' | 'external';
  line: number;
  markers: MarkerUnit[];
  content?: string;
  name?: string;
  source?: string;
};

export type TabUnit = {
  type: 'tab';
  line: number;
  value: string | undefined;
  markers: MarkerUnit[];
  children: CodeExampleUnit[];
};

export type TabsUnit = {
  type: 'tabs';
  line: number;
  groupId: string | undefined;
  items: string[] | undefined;
  markers: MarkerUnit[];
  children: CodeExampleUnit[];
};

export type CodeExampleUnit = MarkerUnit | FenceUnit | ComponentUnit | TabUnit | TabsUnit;
export type ParsedCodeExamples = { path: string; units: CodeExampleUnit[] };

const MARKER_TARGETS: Record<string, string> = {
  'single-language': 'a standalone example or a non-language <Tabs>',
  'single-language-page': 'a page about a language-specific framework',
  'no-api': 'a language group with no HTTP equivalent',
  'unchecked-api': 'a shell fence, scoped by rule and operation',
};
const PYTHON_LANGS: Record<string, true> = { python: true, py: true };
const TYPESCRIPT_LANGS: Record<string, true> = { typescript: true, ts: true, tsx: true, javascript: true, js: true };
const SDK_LANGS: Record<string, true> = { ...PYTHON_LANGS, ...TYPESCRIPT_LANGS };
const SHELL_LANGS: Record<string, true> = { bash: true, sh: true, shell: true, curl: true };
const NO_LANGS: Record<string, true> = {};
const CANONICAL_ITEMS = [['Python', 'TypeScript'], ['Python', 'TypeScript', 'API']];
const VERSION_SUFFIX_RE = /^\(.+\)$|^v\d+$/;

function parseMarker(body: string, form: MarkerUnit['form'], line: number): MarkerUnit {
  const match = /^\s*code-example:\s*(\S+)\s*([\s\S]*)$/.exec(body);
  const attributes: Record<string, string> = {};
  let remainder = match?.[2] ?? '';
  let wellFormed = Boolean(match);
  while (remainder.trim()) {
    const attribute = /^\s*([a-z-]+)="([^"]*)"\s*/.exec(remainder);
    if (!attribute || Object.hasOwn(attributes, attribute[1])) {
      wellFormed = false;
      break;
    }
    attributes[attribute[1]] = attribute[2];
    remainder = remainder.slice(attribute[0].length);
  }
  const kind = match?.[1];
  const allowed = kind === 'unchecked-api' ? ['reason', 'rule', 'operation', 'field'] : ['reason'];
  wellFormed &&= Object.keys(attributes).every((key) => allowed.includes(key));
  const marker: MarkerUnit = { type: 'marker', line, form, kind, reason: attributes.reason, wellFormed };
  if (kind === 'unchecked-api') {
    wellFormed &&= Boolean(attributes.rule && attributes.operation);
    marker.wellFormed = wellFormed;
    marker.api = { rule: attributes.rule ?? '', operation: attributes.operation ?? '', ...(attributes.field ? { field: attributes.field } : {}) };
  }
  return marker;
}


function markerFromNode(node: ExampleNode): MarkerUnit | undefined {
  let body: string | undefined;
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    body = /^\s*\/\*\s*(code-example:[\s\S]*?)\*\/\s*$/.exec(node.value)?.[1];
  } else if (node.type === 'html') {
    body = /^\s*<!--\s*(code-example:[\s\S]*?)-->\s*$/.exec(node.value)?.[1];
  }
  return body === undefined ? undefined : parseMarker(body, node.type === 'html' ? 'html' : 'mdx', node.position?.start.line ?? 1);
}

/** Parses only real syntax nodes; arbitrary wrappers preserve their nested examples. */
export function parseCodeExamples(source: string, path: string): ParsedCodeExamples {
  const tree = parseExampleDocument(source, path);
  const convert = (nodes: readonly ExampleNode[], fragment = source): CodeExampleUnit[] => {
    const units: CodeExampleUnit[] = [];
    let pending: MarkerUnit[] = [];
    let pendingEnd = 0;
    const flush = () => { units.push(...pending); pending = []; };
    for (const node of nodes) {
      const line = node.position?.start.line ?? 1;
      const marker = markerFromNode(node);
      if (marker) {
        if (marker.kind === 'single-language-page') {
          flush();
          units.push(marker);
        } else {
          if (pending.length && fragment.slice(pendingEnd, node.position?.start.offset).trim()) flush();
          pending.push(marker);
          pendingEnd = node.position?.end.offset ?? 0;
        }
        continue;
      }
      const adjacent = pending.length && !fragment.slice(pendingEnd, node.position?.start.offset).trim();
      const markers = adjacent ? pending : [];
      if (adjacent) pending = [];
      else flush();
      if (node.type === 'code') {
        units.push({ type: 'fence', line, lang: (node.lang ?? '').toLowerCase(), info: [node.lang, node.meta].filter(Boolean).join(' '), code: node.value, markers });
      } else if (node.type === 'table') {
        units.push({ type: 'table', line, markers, content: toString(node) });
      } else if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        const value = attributeValue(node, 'value');
        const groupId = attributeValue(node, 'groupId');
        const items = attributeValue(node, 'items');
        if (node.name === 'Tabs') {
          units.push({ type: 'tabs', line, groupId: typeof groupId === 'string' ? groupId : undefined, items: Array.isArray(items) ? items : undefined, markers, children: convert(node.children, fragment) });
        } else if (node.name === 'Tab') {
          units.push({ type: 'tab', line, value: typeof value === 'string' ? value : undefined, markers, children: convert(node.children, fragment) });
        } else if (node.name === 'Callout' || node.name === 'PackageInstall') {
          units.push({ type: node.name === 'Callout' ? 'callout' : 'package-install', line, markers, content: toString(node) });
          units.push(...convert(node.children, fragment));
        } else if (node.name === 'FileBuildup' || node.name === 'RepoBrowser') {
          const key = attributeValue(node, node.name === 'FileBuildup' ? 'name' : 'source');
          units.push({ type: 'external', line, markers, name: node.name, source: typeof key === 'string' ? key : node.name === 'RepoBrowser' ? 'slack-bot' : undefined });
        } else {
          units.push(...markers, ...convert(node.children, fragment));
        }
      } else if (node.type === 'blockquote' && /^\[!NOTE\](?:\s|$)/.test(toString(node))) {
        units.push({ type: 'callout', line, markers, content: toString(node).replace(/^\[!NOTE\]\s*/, '') });
        units.push(...convert(node.children, fragment));
      } else if ('children' in node) {
        units.push(...markers, ...convert(node.children, fragment));
      } else {
        units.push(...markers);
      }
    }
    flush();
    return units;
  };
  if (!path.endsWith('.md')) return { path, units: convert(tree.children) };
  const groups = markdownLanguageGroups(source);
  if (!groups.length) return { path, units: convert(tree.children) };
  const units: CodeExampleUnit[] = [];
  let offset = 0;
  const shiftLines = (children: CodeExampleUnit[], delta: number) => walkCodeExamples(children, (unit) => {
    unit.line += delta;
    if ('markers' in unit) for (const marker of unit.markers) marker.line += delta;
  });
  for (const group of groups) {
    const before = source.slice(offset, group.start);
    const beforeNodes = parseExampleDocument(before, 'part.md').children;
    const markers: MarkerUnit[] = [];
    let end = before.length;
    for (const node of [...beforeNodes].reverse()) {
      const marker = markerFromNode(node);
      const nodeEnd = node.position?.end.offset;
      if (!marker || nodeEnd === undefined || before.slice(nodeEnd, end).trim()) break;
      markers.unshift(marker);
      end = node.position!.start.offset!;
    }
    const beforeUnits = convert(beforeNodes.slice(0, beforeNodes.length - markers.length), before);
    const lineOffset = source.slice(0, offset).split('\n').length - 1;
    shiftLines(beforeUnits, lineOffset);
    for (const marker of markers) marker.line += lineOffset;
    units.push(...beforeUnits);
    const tabs: TabsUnit = { type: 'tabs', line: group.line, groupId: 'language', items: group.tabs.map((tab) => tab.value), markers, children: [] };
    for (const tab of group.tabs) {
      const children = parseCodeExamples(tab.source, 'part.md').units;
      shiftLines(children, tab.line - 1);
      tabs.children.push({ type: 'tab', line: tab.line, value: tab.value, markers: [], children });
    }
    units.push(tabs);
    offset = group.end;
  }
  const tail = source.slice(offset);
  const trailing = convert(parseExampleDocument(tail, 'part.md').children, tail);
  const lineOffset = source.slice(0, offset).split('\n').length - 1;
  shiftLines(trailing, lineOffset);
  units.push(...trailing);
  return { path, units };
}

/**
 * Visits every unit depth-first in document order. `ancestors` is the enclosing
 * Tabs/Tab chain, outermost first; it is never mutated, so visitors may keep it.
 */
export function walkCodeExamples(
  units: CodeExampleUnit[],
  visit: (unit: CodeExampleUnit, ancestors: (TabsUnit | TabUnit)[]) => void,
  ancestors: (TabsUnit | TabUnit)[] = [],
): void {
  for (const unit of units) {
    visit(unit, ancestors);
    if (unit.type === 'tab' || unit.type === 'tabs') walkCodeExamples(unit.children, visit, [...ancestors, unit]);
  }
}

function descendants(units: CodeExampleUnit[]): CodeExampleUnit[] {
  const out: CodeExampleUnit[] = [];
  walkCodeExamples(units, (unit) => out.push(unit));
  return out;
}

const hasMarker = (markers: MarkerUnit[], kind: string) => markers.some((marker) => marker.kind === kind);
const formatItems = (items: string[]) => `[${items.map((item) => `'${item}'`).join(', ')}]`;

/** Returns the shared suffix when items are a versioned `['Python <S>', 'TypeScript <S>']` pair. */
function versionSuffix(items: string[] | undefined): string | undefined {
  if (!items || ![2, 3].includes(items.length) || !items[0].startsWith('Python ') || !items[1].startsWith('TypeScript ') ||
    (items.length === 3 && items[2] !== 'API')) {
    return undefined;
  }
  const suffix = items[0].slice('Python '.length);
  return suffix === items[1].slice('TypeScript '.length) && VERSION_SUFFIX_RE.test(suffix) ? suffix : undefined;
}

function validLanguageItems(items: string[] | undefined): boolean {
  if (!items) return false;
  return (
    CANONICAL_ITEMS.some(
      (canonical) => canonical.length === items.length && canonical.every((item, i) => item === items[i]),
    ) || versionSuffix(items) !== undefined
  );
}

function checkFile(parsed: ParsedCodeExamples, requireApi: boolean): CodeExampleViolation[] {
  const violations: CodeExampleViolation[] = [];
  const report = (line: number, rule: CodeExampleRule, message: string) =>
    violations.push({ path: parsed.path, line, rule, message });
  const pageMarker = descendants(parsed.units).some(
    (unit) => unit.type === 'marker' && unit.kind === 'single-language-page',
  );

  /** Reports marker problems; `appliesTo` says whether the marker's kind fits the construct it precedes. */
  const checkMarkers = (markers: MarkerUnit[], appliesTo: (kind: string) => boolean) => {
    for (const marker of markers) {
      if (!marker.kind || !Object.hasOwn(MARKER_TARGETS, marker.kind)) {
        report(
          marker.line,
          'marker-invalid',
          `unknown code-example marker kind "${marker.kind ?? ''}"; expected one of ${Object.keys(MARKER_TARGETS).join(', ')}`,
        );
        continue;
      }
      if (!marker.wellFormed || !marker.reason?.trim()) {
        report(marker.line, 'marker-invalid', `code-example ${marker.kind} marker needs a non-empty reason="..."`);
      }
      if (!appliesTo(marker.kind)) {
        report(
          marker.line,
          'marker-invalid',
          `code-example ${marker.kind} marker must be directly followed (only blank lines between) by ${MARKER_TARGETS[marker.kind]}`,
        );
      }
    }
  };

  const checkLanguageGroup = (tabs: TabsUnit) => {
    const items = tabs.items;
    if (!validLanguageItems(items)) {
      report(
        tabs.line,
        'language-items',
        `language Tabs items must be ['Python', 'TypeScript'], ['Python', 'TypeScript', 'API'], or a versioned pair ['Python <S>', 'TypeScript <S>']; got ${items ? formatItems(items) : 'missing or non-literal items'}`,
      );
    }
    const tabUnits = tabs.children.filter((unit): unit is TabUnit => unit.type === 'tab');
    const seen = new Set<string>();
    for (const tab of tabUnits) {
      if (tab.value === undefined) {
        report(tab.line, 'language-items', '<Tab> in a language group has no value');
      } else if (seen.has(tab.value)) {
        report(tab.line, 'language-items', `duplicate <Tab value="${tab.value}">`);
      } else {
        seen.add(tab.value);
        if (items && !items.includes(tab.value)) {
          report(tab.line, 'language-items', `<Tab value="${tab.value}"> is not one of items ${formatItems(items)}`);
        }
      }
    }
    for (const item of items ?? []) {
      if (!seen.has(item)) report(tabs.line, 'language-items', `item '${item}' has no matching <Tab>`);
    }

    for (const tab of tabUnits) {
      const content = descendants(tab.children);
      const fences = content.filter((unit): unit is FenceUnit => unit.type === 'fence');
      const hasCallout = content.some((unit) => unit.type === 'callout' && Boolean(unit.content?.trim()));
      if (fences.some((fence) => !fence.code.trim()) ||
        (!fences.length && !hasCallout && !content.some((unit) => unit.type === 'package-install' || unit.type === 'table'))) {
        report(
          tab.line,
          'language-empty-tab',
          `<Tab value="${tab.value ?? ''}"> has no code fence, Markdown table, <PackageInstall>, or <Callout>`,
        );
        continue;
      }
      const value = tab.value ?? '';
      const forbidden =
        value === 'API'
          ? SDK_LANGS
          : value.startsWith('Python')
            ? TYPESCRIPT_LANGS
            : value.startsWith('TypeScript')
              ? PYTHON_LANGS
              : NO_LANGS;
      for (const fence of fences) {
        if (forbidden[fence.lang] === true) {
          report(fence.line, 'language-cross-fence', `\`${fence.lang}\` fence inside <Tab value="${value}">`);
        }
      }
      const sdkLanguages = value.startsWith('Python') ? PYTHON_LANGS : value.startsWith('TypeScript') ? TYPESCRIPT_LANGS : undefined;
      const shellInstructions = fences.every((fence) => {
        if (!SHELL_LANGS[fence.lang]) return true;
        const install = /(?:^|\n)\s*(?:pip(?:3)? install|python(?:3(?:\.\d+)?)? -m (?:pip install|venv)|npm (?:install|i)|pnpm add|bun add|yarn add|uv (?:add|pip install))\b/.test(fence.code);
        const run = value.startsWith('Python') ? /(?:^|\n)\s*(?:python(?:3(?:\.\d+)?)?|uv run python)\s+(?:\S+\.py\b|-[cm]\s)/.test(fence.code) :
          value.startsWith('TypeScript') && /(?:^|\n)\s*(?:npx (?:tsx|ts-node)|bun|node)\s+(?:--input-type=module\s+)?(?:\S+\.(?:ts|js)\b|-e\s)/.test(fence.code);
        return install || run;
      });
      if (sdkLanguages && !hasCallout && !content.some((unit) => unit.type === 'table' || unit.type === 'package-install') &&
        !fences.some((fence) => sdkLanguages[fence.lang]) &&
        !shellInstructions && fences.some((fence) => SHELL_LANGS[fence.lang])) {
        report(tab.line, 'language-cross-fence', `<Tab value="${value}"> contains shell operations instead of a ${value} example`);
      }
      if (value === 'API' && !hasCallout && !fences.some((fence) => fence.lang === 'bash')) {
        report(tab.line, 'language-cross-fence', '<Tab value="API"> must contain a bash fence or a <Callout>');
      }
    }

    // Install-only groups (PackageInstall, pip/npm commands) have no API counterpart.
    const hasSdkFence = descendants(tabs.children).some((unit) => unit.type === 'fence' && SDK_LANGS[unit.lang] === true);
    if (
      requireApi &&
      hasSdkFence &&
      !items?.includes('API') &&
      !hasMarker(tabs.markers, 'no-api')
    ) {
      report(
        tabs.line,
        'api-missing',
        `language Tabs has no 'API' item; add an API tab or a {/* code-example: no-api reason="..." */} marker`,
      );
    }
  };

  const walk = (units: CodeExampleUnit[], inLanguage: boolean, enclosingTabs: TabsUnit | undefined) => {
    for (const unit of units) {
      switch (unit.type) {
        case 'marker':
          checkMarkers([unit], (kind) => kind === 'single-language-page');
          break;
        case 'fence': {
          const standaloneSdk = SDK_LANGS[unit.lang] === true && !inLanguage;
          const standaloneApi = SHELL_LANGS[unit.lang] === true && /\bcurl\b[\s\S]*(?:backend\.composio\.dev|\$COMPOSIO_BASE_URL)/.test(unit.code) && !inLanguage;
          checkMarkers(unit.markers, (kind) =>
            kind === 'single-language' ? standaloneSdk || standaloneApi : kind === 'unchecked-api' && SHELL_LANGS[unit.lang] === true,
          );
          if (
            standaloneSdk &&
            !pageMarker &&
            !hasMarker(unit.markers, 'single-language') &&
            !(enclosingTabs && hasMarker(enclosingTabs.markers, 'single-language'))
          ) {
            report(
              unit.line,
              'standalone-sdk-fence',
              `\`${unit.lang}\` fence outside a <Tabs groupId="language"> group; pair it with the other SDK or add a code-example single-language marker`,
            );
          }
          if (standaloneApi && !hasMarker(unit.markers, 'single-language')) {
            report(unit.line, 'standalone-api-fence', 'Composio curl example needs Python, TypeScript, and API options; use SDK-gap Callouts for unavailable operations');
          }
          break;
        }
        case 'tabs': {
          const isLanguage = unit.groupId === 'language';
          checkMarkers(unit.markers, (kind) => (isLanguage ? kind === 'no-api' : kind === 'single-language'));
          if (isLanguage) checkLanguageGroup(unit);
          walk(unit.children, inLanguage || isLanguage, unit);
          break;
        }
        case 'tab':
          checkMarkers(unit.markers, () => false);
          walk(unit.children, inLanguage, enclosingTabs);
          break;
        case 'external': {
          checkMarkers(unit.markers, (kind) => kind === 'single-language');
          const exists = unit.name === 'FileBuildup'
            ? unit.source !== undefined && Object.hasOwn(FILE_BUILDS, unit.source)
            : unit.source !== undefined && Object.hasOwn(EXAMPLE_SOURCES, unit.source);
          if (!exists) report(unit.line, 'external-example', `${unit.name} must select an inventoried static source`);
          const framework = unit.name === 'FileBuildup' ? EXAMPLE_BUILD_SOURCES[unit.source ?? ''] : unit.source;
          if (!framework || !Object.hasOwn(EXAMPLE_SOURCE_REASONS, framework)) {
            report(unit.line, 'external-example', `${unit.name} needs a registered language-specific runtime or language alternatives`);
          }
          break;
        }
        default:
          checkMarkers(unit.markers, () => false);
      }
    }
  };

  walk(parsed.units, false, undefined);
  return violations;
}

/** Checks every file and returns violations sorted by path, line, rule, and message. */
export function checkCodeExamples(
  files: readonly CodeExampleFile[],
  options: { requireApi: boolean },
): CodeExampleViolation[] {
  return files.flatMap((file): CodeExampleViolation[] => {
    try {
      return checkFile(parseCodeExamples(file.source, file.path), options.requireApi);
    } catch (error) {
      return [{ path: file.path, line: 1, rule: 'example-syntax', message: String(error) }];
    }
  })
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.line - b.line ||
        a.rule.localeCompare(b.rule) ||
        a.message.localeCompare(b.message),
    );
}

// Generated copies are inventoried below; their canonical authored inputs are checked once.
const SCOPE_DIRS = ['content/docs', 'content/examples', 'content/reference', 'content/toolkits', 'api-overviews', 'kb/source', 'kb/articles'];
const EXCLUDED_DIRS = ['content/reference/sdk-reference', 'content/reference/api-reference', 'content/reference/v3/api-reference'];

/** Lists authored `.md`/`.mdx` pages in code example scope, with paths relative to `docsRoot`. */
export function listCodeExampleFiles(docsRoot: string): CodeExampleFile[] {
  const files: CodeExampleFile[] = [];
  const visit = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const path = relative(docsRoot, fullPath).split(sep).join('/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.includes(path)) visit(fullPath);
      } else if (/\.mdx?$/.test(entry.name)) {
        files.push({ path, source: readFileSync(fullPath, 'utf8') });
      }
    }
  };
  for (const dir of SCOPE_DIRS) visit(join(docsRoot, dir));
  for (const [name, source] of [['session', SESSION_GUARDRAILS], ['direct-execution', DIRECT_EXECUTION_GUARDRAILS]]) {
    const path = `lib/llm-guardrails/${name}.ts`;
    const declaration = readFileSync(join(docsRoot, path), 'utf8').split('\n').findIndex((line) => line.startsWith('export const '));
    if (declaration < 0) throw new Error(`${path} has no guardrail declaration`);
    // A Markdown projection of a TS template literal; padding retains source line numbers.
    files.push({ path: `${path}#rendered.md`, source: '\n'.repeat(declaration) + source });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}


export type CodeExampleInventoryEntry = {
  path: string;
  line: number;
  kind: string;
  language?: string;
  options: string[];
  validation: 'maintained' | 'generated-copy' | 'symbol-reference' | 'historical' | 'framework-source';
  reason?: string;
};

/** Includes published Markdown surfaces and every committed file-backed example. */
export function inventoryCodeExamples(docsRoot: string): CodeExampleInventoryEntry[] {
  const entries: CodeExampleInventoryEntry[] = [];
  const maintained = new Set(listCodeExampleFiles(docsRoot).map((file) => file.path));
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.mdx?$/.test(entry.name)) {
        const path = relative(docsRoot, full).split(sep).join('/');
        const parsed = parseCodeExamples(readFileSync(full, 'utf8'), path);
        const pageReason = descendants(parsed.units).find((unit) => unit.type === 'marker' && unit.kind === 'single-language-page');
        walkCodeExamples(parsed.units, (unit, ancestors) => {
          if (unit.type !== 'fence' && unit.type !== 'external' && unit.type !== 'package-install') return;
          const group = ancestors.findLast((ancestor) => ancestor.type === 'tabs' && ancestor.groupId === 'language');
          const validation = maintained.has(path) ? 'maintained' : path.startsWith('content/changelog/') ? 'historical' :
            path.startsWith('content/reference/sdk-reference/') ? 'symbol-reference' : 'generated-copy';
          const marker = unit.markers.find((item) => item.reason) ?? (pageReason?.type === 'marker' ? pageReason : undefined);
          const reason = marker?.reason ?? (validation === 'symbol-reference'
            ? 'Language-specific SDK symbol documentation includes signatures and partial API usage; maintained cross-language operation examples live in the guides'
            : validation === 'historical' ? 'Immutable release history is inventoried, not rewritten as current API guidance'
            : validation === 'generated-copy' ? 'Generated presentation; canonical api-overviews or kb/source content is checked' : undefined);
          entries.push({ path, line: unit.line, kind: unit.type === 'external' ? unit.name ?? 'external' : unit.type,
            ...(unit.type === 'fence' ? { language: unit.lang } : {}), options: group?.type === 'tabs' ? group.items ?? [] : [], validation,
            ...(reason ? { reason } : {}) });
        });
      }
    }
  };
  for (const directory of ['content', 'api-overviews', 'kb/source', 'kb/articles']) visit(join(docsRoot, directory));
  for (const file of listCodeExampleFiles(docsRoot).filter((entry) => entry.path.includes('#rendered.md'))) {
    walkCodeExamples(parseCodeExamples(file.source, file.path).units, (unit, ancestors) => {
      if (unit.type !== 'fence') return;
      const group = ancestors.findLast((ancestor) => ancestor.type === 'tabs' && ancestor.groupId === 'language');
      entries.push({ path: file.path, line: unit.line, kind: 'agent Markdown fence', language: unit.lang,
        options: group?.type === 'tabs' ? group.items ?? [] : [], validation: 'maintained' });
    });
  }
  const specSchema = z.object({
    paths: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    webhooks: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  });
  for (const filename of ['openapi.json', 'openapi-v3.json', 'openapi-webhooks.json']) {
    const spec = specSchema.parse(JSON.parse(readFileSync(join(docsRoot, 'public', filename), 'utf8')));
    for (const [section, paths] of Object.entries(spec)) {
      for (const [path, methods] of Object.entries(paths ?? {})) {
        for (const method of Object.keys(methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
          entries.push({ path: `public/${filename}#/${section}/${path}/${method}`, line: 1,
            kind: 'generated API operation', options: [...apiCodeUsages.map().values()].map((generator) => generator.label ?? generator.lang), validation: 'generated-copy',
            reason: 'Request examples are generated directly from this OpenAPI operation by the shared API reference code-usage registry' });
        }
      }
    }
  }
  for (const [name, build] of Object.entries(FILE_BUILDS)) {
    const framework = EXAMPLE_BUILD_SOURCES[name];
    if (!framework) throw new Error(`FileBuildup ${name} has no documented source runtime`);
    for (const [index] of build.stages.entries()) {
      entries.push({ path: `lib/file-builds.ts#${name}/${index + 1}/${build.file}`, line: 1, kind: 'FileBuildup source',
        language: build.file.endsWith('.py') ? 'python' : 'typescript', options: [], validation: 'framework-source',
        reason: EXAMPLE_SOURCE_REASONS[framework] });
    }
  }
  for (const [name, files] of Object.entries(EXAMPLE_SOURCES)) {
    for (const file of files) {
      entries.push({ path: `lib/${name}-source.json#${file.path}`, line: 1, kind: 'RepoBrowser source', options: [],
        language: file.path.endsWith('.py') ? 'python' : /\.(?:ts|tsx|js)$/.test(file.path) ? 'typescript' : 'text',
        validation: 'framework-source', reason: EXAMPLE_SOURCE_REASONS[name as keyof typeof EXAMPLE_SOURCE_REASONS] });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}
