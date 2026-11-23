/**
 * TypeScript SDK Documentation Generator
 *
 * Generates MDX documentation from TypeScript source code using TypeDoc.
 * Output is written to the docs content directory.
 *
 * Run: pnpm --filter @composio/core generate:docs
 */

import { readFileSync } from 'fs';
import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { z } from 'zod';
import { Effect } from 'effect';
import ts from 'typescript6';
import { renderAuthoredExample } from '../../../../scripts/docs-reference-check/pages';

// Paths (relative to ts/packages/core)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SCRIPT_DIR, '..');
const MODELS_DIR = join(PACKAGE_DIR, 'src/models');
const OUTPUT_DIR = join(PACKAGE_DIR, '../../../docs/content/reference/sdk-reference/typescript');
const TEMP_JSON = join(PACKAGE_DIR, '.typedoc-output.json');
const TYPEDOC_BIN = join(
  dirname(fileURLToPath(import.meta.resolve('typedoc/package.json'))),
  'bin',
  'typedoc'
);

// Internal classes that should NOT be documented (accessed via other APIs)
const INTERNAL_CLASSES = new Set([
  'AuthScheme', // Utility class
  'ConnectionRequest', // Utility
  'Files', // Not yet stable API
  'ToolRouter', // Experimental
]);

// Classes that users instantiate directly (show constructor)
const USER_INSTANTIATED_CLASSES = new Set(['Composio']);

// Pure-docs presentation overrides. The public class names retain their
// legacy "ToolRouter*" names in source (renaming them is a breaking change),
// but the SDK reference presents them under the canonical "Session" naming.
// Keys are the source class names.
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  ToolRouterSession: 'Session',
  ToolRouterSessionFilesMount: 'Session files',
};

const SLUG_OVERRIDES: Record<string, string> = {
  ToolRouterSession: 'session',
  ToolRouterSessionFilesMount: 'session-files',
};

// Resolve the display title for a class (falls back to the class name).
function displayNameFor(className: string): string {
  return DISPLAY_NAME_OVERRIDES[className] ?? className;
}

// Resolve the URL slug / filename stem for a class (falls back to kebab-case).
function slugFor(className: string): string {
  return SLUG_OVERRIDES[className] ?? toKebabCase(className);
}

// Model file names become typedoc arguments. They are never interpolated into a
// shell, but a name outside this charset is still not a model and is skipped
// rather than passed through.
const MODEL_FILE_NAME = /^[A-Za-z0-9_.-]+\.ts$/;

// Discover model files automatically
export async function discoverModelFiles(modelsDir: string = MODELS_DIR): Promise<string[]> {
  const files = await readdir(modelsDir);
  return files
    .filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'))
    .filter(f => {
      if (MODEL_FILE_NAME.test(f)) {
        return true;
      }
      console.warn(`  Skipping model file with an unexpected name: ${JSON.stringify(f)}`);
      return false;
    })
    .map(f => `src/models/${f}`);
}

// TypeDoc arguments, one array element per argument so the entry points are
// never joined into a shell command line.
function buildTypeDocArgs(
  entryPoints: readonly string[],
  outputJson: string = TEMP_JSON,
  packageDir: string = PACKAGE_DIR
): string[] {
  return [
    '--json',
    outputJson,
    '--tsconfig',
    'tsconfig.json',
    // Without this, TypeDoc reports source paths relative to the common
    // directory of every file it visited, which moves whenever a model pulls in
    // a file outside `src/`. Pinning it keeps `sources[].fileName` resolvable.
    '--displayBasePath',
    packageDir,
    '--excludePrivate',
    '--excludeProtected',
    '--excludeInternal',
    '--skipErrorChecking', // Skip TS errors, we just want the documentation
    ...entryPoints,
  ];
}

interface TypeDocCommandOptions {
  outputJson?: string;
  packageDir?: string;
  typedocBin?: string;
}

export function runTypeDocCommand(
  entryPoints: readonly string[],
  {
    outputJson = TEMP_JSON,
    packageDir = PACKAGE_DIR,
    typedocBin = TYPEDOC_BIN,
  }: TypeDocCommandOptions = {}
): void {
  execFileSync(
    process.execPath,
    [typedocBin, ...buildTypeDocArgs(entryPoints, outputJson, packageDir)],
    {
      stdio: 'pipe',
      cwd: packageDir,
    }
  );
}

// TypeDoc kind numbers (v2.0 schema)
const TYPEDOC_KIND = {
  Module: 2,
  Class: 128,
  Constructor: 512,
  Method: 2048,
  Property: 1024,
  Accessor: 262144,
} as const;

// The subset of TypeDoc's JSON that the Usage walk reads. Parsing it at load
// time turns a TypeDoc schema change into an error that names the field,
// instead of a Usage block that silently disappears.
const typeDocCommentSchema = z.object({
  blockTags: z.array(z.object({ tag: z.string() })).optional(),
});

const typeDocMemberTypeSchema = z.object({
  type: z.string(),
  // A number for reflections in this project; an object for external symbols.
  target: z.unknown().optional(),
  refersToTypeParameter: z.boolean().optional(),
});

const typeDocGraphNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.number(),
  flags: z
    .object({
      isPrivate: z.boolean().optional(),
      isProtected: z.boolean().optional(),
      isStatic: z.boolean().optional(),
    })
    .optional(),
  comment: typeDocCommentSchema.optional(),
  sources: z
    .array(z.object({ fileName: z.string(), line: z.number(), character: z.number() }))
    .optional(),
  type: typeDocMemberTypeSchema.optional(),
  getSignature: z
    .object({
      comment: typeDocCommentSchema.optional(),
      type: typeDocMemberTypeSchema.optional(),
    })
    .optional(),
  get children() {
    return z.array(typeDocGraphNodeSchema).optional();
  },
});

type TypeDocGraphNode = z.infer<typeof typeDocGraphNodeSchema>;

export function parseTypeDocGraph(json: unknown): TypeDocGraphNode {
  const result = typeDocGraphNodeSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `TypeDoc output does not have the shape the Usage walk reads:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}

/** How a documented class is reached from a `Composio` instance. */
export interface AccessPath {
  path: string[];
  deprecated: boolean;
}

interface RankedAccessPath extends AccessPath {
  sourceMembers: TypeDocGraphNode[];
}

function compareDeclaration(left: TypeDocGraphNode, right: TypeDocGraphNode): number {
  const a = left.sources?.[0];
  const b = right.sources?.[0];
  if (a && b) {
    const position =
      a.fileName.localeCompare(b.fileName) || a.line - b.line || a.character - b.character;
    if (position !== 0) return position;
  }
  // TypeDoc allocates reflection IDs before sorting its children for presentation.
  return left.id - right.id;
}

function isDeprecatedComment(comment: TypeDocGraphNode['comment']): boolean {
  return comment?.blockTags?.some(tag => tag.tag === '@deprecated') ?? false;
}

/** The reflection fields that identify a class and nest it in a module. */
interface TypeDocCatalogNode<N> {
  id: number;
  name: string;
  kind: number;
  children?: N[];
}

/**
 * Every class in a TypeDoc project, declared at the top level or one module
 * deep, in project order. This is the only walk that enumerates classes, so
 * documentation order, name lookup, ID lookup, and access paths agree on
 * which classes exist.
 */
export class TypeDocClassCatalog<N extends TypeDocCatalogNode<N>> {
  readonly classes: readonly N[];
  private readonly ids = new Map<number, N>();

  constructor(project: { children?: N[] }) {
    const classes: N[] = [];
    for (const child of project.children ?? []) {
      if (child.kind === TYPEDOC_KIND.Class) classes.push(child);
      if (child.kind === TYPEDOC_KIND.Module) {
        for (const nested of child.children ?? []) {
          if (nested.kind === TYPEDOC_KIND.Class) classes.push(nested);
        }
      }
    }
    this.classes = classes;
    for (const node of classes) this.ids.set(node.id, node);
  }

  /** The first class with this name in project order. */
  byName(name: string): N | undefined {
    return this.classes.find(node => node.name === name);
  }

  byId(id: number): N | undefined {
    return this.ids.get(id);
  }

  /**
   * Names of the classes that get a reference page: `Composio` first, then
   * every non-internal class in project order, each name once.
   */
  documentedNames(): string[] {
    const names = ['Composio'];
    for (const node of this.classes) {
      if (!INTERNAL_CLASSES.has(node.name) && !names.includes(node.name)) names.push(node.name);
    }
    return names;
  }

  /**
   * Maps each documented class to the property path that reaches it from a
   * `Composio` instance. Classes reached only through return values (sessions,
   * remote files) or through internal classes get no entry.
   */
  accessPaths(this: TypeDocClassCatalog<TypeDocGraphNode>): Map<string, AccessPath> {
    const root = this.byName('Composio');
    if (!root) throw new Error('TypeDoc output has no Composio class');

    const best = new Map<string, RankedAccessPath>();

    const visit = (node: TypeDocGraphNode, from: RankedAccessPath, onPath: Set<number>): void => {
      for (const member of node.children ?? []) {
        const targetId = referencedClassId(member);
        const target = targetId === undefined ? undefined : this.byId(targetId);
        if (!target || INTERNAL_CLASSES.has(target.name) || onPath.has(target.id)) continue;

        const memberDeprecated =
          isDeprecatedComment(member.comment) || isDeprecatedComment(member.getSignature?.comment);
        const candidate: RankedAccessPath = {
          path: [...from.path, member.name],
          deprecated: from.deprecated || memberDeprecated,
          sourceMembers: [...from.sourceMembers, member],
        };
        const current = best.get(target.name);
        if (!current || isBetterPath(candidate, current)) best.set(target.name, candidate);

        visit(target, candidate, new Set([...onPath, target.id]));
      }
    };

    visit(root, { path: [], deprecated: false, sourceMembers: [] }, new Set([root.id]));

    return new Map(
      [...best.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, { path, deprecated }]) => [name, { path, deprecated }])
    );
  }
}

function referencedClassId(member: TypeDocGraphNode): number | undefined {
  if (member.flags?.isPrivate || member.flags?.isProtected || member.flags?.isStatic) {
    return undefined;
  }
  const type =
    member.kind === TYPEDOC_KIND.Property
      ? member.type
      : member.kind === TYPEDOC_KIND.Accessor
        ? member.getSignature?.type
        : undefined;
  if (type?.type !== 'reference' || type.refersToTypeParameter) return undefined;
  return typeof type.target === 'number' ? type.target : undefined;
}

// Ranks candidate paths: non-deprecated first, then shortest, then the
// earliest member at the first position where the paths differ.
function isBetterPath(candidate: RankedAccessPath, current: RankedAccessPath): boolean {
  if (candidate.deprecated !== current.deprecated) return !candidate.deprecated;
  if (candidate.path.length !== current.path.length) {
    return candidate.path.length < current.path.length;
  }
  for (let i = 0; i < candidate.sourceMembers.length; i++) {
    const order = compareDeclaration(candidate.sourceMembers[i], current.sourceMembers[i]);
    if (order !== 0) return order < 0;
  }
  return false;
}

interface TypeDocReflection {
  id: number;
  name: string;
  kind: number;
  kindString?: string;
  comment?: {
    summary?: Array<{ kind: string; text: string }>;
    blockTags?: Array<{
      tag: string;
      content: Array<{ kind: string; text: string }>;
    }>;
  };
  signatures?: TypeDocSignature[];
  type?: TypeDocType;
  children?: TypeDocReflection[];
  flags?: {
    isPrivate?: boolean;
    isProtected?: boolean;
    isPublic?: boolean;
    isOptional?: boolean;
    isStatic?: boolean;
  };
  sources?: Array<{ fileName: string; line: number }>;
  typeParameters?: TypeDocTypeParameter[];
  defaultValue?: string;
}

interface TypeDocSignature {
  id: number;
  name: string;
  kind: number;
  kindString?: string;
  comment?: TypeDocReflection['comment'];
  parameters?: TypeDocParameter[];
  type?: TypeDocType;
  typeParameter?: TypeDocTypeParameter[];
  sources?: Array<{ fileName: string; line: number }>;
}

interface TypeDocParameter {
  id: number;
  name: string;
  kind: number;
  flags?: { isOptional?: boolean };
  type?: TypeDocType;
  comment?: TypeDocReflection['comment'];
  defaultValue?: string;
}

export function isParameterRequired(
  param: Pick<TypeDocParameter, 'flags' | 'defaultValue'>
): boolean {
  return !param.flags?.isOptional && param.defaultValue === undefined;
}

interface TypeDocType {
  type: string;
  name?: string;
  value?: string | number | boolean;
  elementType?: TypeDocType;
  types?: TypeDocType[];
  typeArguments?: TypeDocType[];
  declaration?: TypeDocReflection;
  target?: number | TypeDocType;
  package?: string;
  qualifiedName?: string;
}

interface TypeDocTypeParameter {
  id: number;
  name: string;
  kind: number;
  type?: TypeDocType;
  default?: TypeDocType;
}

interface TypeDocProject {
  id: number;
  name: string;
  kind: number;
  children?: TypeDocReflection[];
}

interface MethodDoc {
  name: string;
  description: string;
  signatures: {
    parameters: {
      name: string;
      type: string;
      required: boolean;
      description: string;
      default?: string;
    }[];
    returnType: string;
    returnDescription?: string;
  }[];
  examples: string[];
  isAsync: boolean;
  /** Present when the symbol carries an `@deprecated` JSDoc tag. The string is
   * the (possibly empty) tag body, e.g. the recommended replacement. */
  deprecated?: string;
  source?: { file: string; line: number };
}

interface PropertyDoc {
  name: string;
  type: string;
  description: string;
  default?: string;
}

interface ClassDoc {
  name: string;
  description: string;
  constructor?: MethodDoc;
  methods: MethodDoc[];
  properties: PropertyDoc[];
  source?: { file: string; line: number };
  /** Present when the class carries a class-level `@deprecated` JSDoc tag. */
  deprecated?: string;
}

interface SourceSignatureTypes {
  parameters: Map<string, string>;
  returnType?: string;
}

const sourceFileCache = new Map<string, string>();

function extractText(content?: Array<{ kind: string; text: string }>): string {
  if (!content) return '';
  return content
    .map(c => c.text)
    .join('')
    .trim();
}

function extractDescription(comment?: TypeDocReflection['comment']): string {
  if (!comment) return '';
  let desc = extractText(comment.summary);

  // Clean up bare API paths that shouldn't be in user-facing docs, while
  // preserving intentional route references inside inline code spans.
  desc = desc
    .split(/(`[^`]*`)/g)
    .map(segment =>
      segment.startsWith('`') ? segment : segment.replace(/\/?api\/v\d+\/[^\s`),.;]*/g, '')
    )
    .join('')
    .trim();

  // Clean up multiple newlines and spaces
  desc = desc
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();

  return desc;
}

function extractTag(comment: TypeDocReflection['comment'] | undefined, tagName: string): string[] {
  if (!comment?.blockTags) return [];
  return comment.blockTags.filter(t => t.tag === tagName).map(t => extractText(t.content));
}

// TypeDoc source paths are relative to `--displayBasePath`, which is the package
// directory. A path that does not resolve means the two have drifted apart, and
// every signature would silently fall back to TypeDoc's expanded types, so the
// read is left to throw.
export function getSourceFileText(fileName: string, packageDir: string = PACKAGE_DIR): string {
  const filePath = resolve(packageDir, fileName);
  const cached = sourceFileCache.get(filePath);
  if (cached !== undefined) return cached;

  const text = readFileSync(filePath, 'utf-8');
  sourceFileCache.set(filePath, text);
  return text;
}

function getLineOffset(text: string, line: number): number {
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const nextLine = text.indexOf('\n', offset);
    if (nextLine === -1) return text.length;
    offset = nextLine + 1;
  }
  return offset;
}

function updateTypeDepth(
  char: string,
  depth: { angle: number; brace: number; bracket: number; paren: number }
) {
  switch (char) {
    case '<':
      depth.angle++;
      break;
    case '>':
      depth.angle = Math.max(0, depth.angle - 1);
      break;
    case '{':
      depth.brace++;
      break;
    case '}':
      depth.brace = Math.max(0, depth.brace - 1);
      break;
    case '[':
      depth.bracket++;
      break;
    case ']':
      depth.bracket = Math.max(0, depth.bracket - 1);
      break;
    case '(':
      depth.paren++;
      break;
    case ')':
      depth.paren = Math.max(0, depth.paren - 1);
      break;
  }
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  const depth = { angle: 0, brace: 0, bracket: 0, paren: 0 };
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prev = input[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    updateTypeDepth(char, depth);

    if (
      char === delimiter &&
      depth.angle === 0 &&
      depth.brace === 0 &&
      depth.bracket === 0 &&
      depth.paren === 0
    ) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  const finalPart = input.slice(start).trim();
  if (finalPart) {
    parts.push(finalPart);
  }
  return parts;
}

function findMatchingParen(text: string, openIndex: number): number {
  const depth = { angle: 0, brace: 0, bracket: 0, paren: 0 };
  let quote: string | null = null;

  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    const prev = text[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth.paren++;
    } else if (char === ')') {
      depth.paren--;
      if (depth.paren === 0) return i;
    } else {
      updateTypeDepth(char, depth);
    }
  }

  return -1;
}

function findTopLevelChar(input: string, target: string): number {
  const depth = { angle: 0, brace: 0, bracket: 0, paren: 0 };
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prev = input[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (
      char === target &&
      !(target === '=' && input[i + 1] === '>') &&
      depth.angle === 0 &&
      depth.brace === 0 &&
      depth.bracket === 0 &&
      depth.paren === 0
    ) {
      return i;
    }

    updateTypeDepth(char, depth);
  }

  return -1;
}

function findReturnTypeColon(text: string, start: number): number {
  const depth = { angle: 0, brace: 0, bracket: 0, paren: 0 };
  let quote: string | null = null;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    const prev = text[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    const isTopLevel =
      depth.angle === 0 && depth.brace === 0 && depth.bracket === 0 && depth.paren === 0;
    if (isTopLevel) {
      if (char === ':') return i;
      if (char === '{' || char === ';') return -1;
    }

    updateTypeDepth(char, depth);
  }

  return -1;
}

function findSignatureEnd(text: string, start: number): number {
  const depth = { angle: 0, brace: 0, bracket: 0, paren: 0 };
  let quote: string | null = null;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    const prev = text[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    const isTopLevel =
      depth.angle === 0 && depth.brace === 0 && depth.bracket === 0 && depth.paren === 0;
    const startsInlineObjectType =
      char === '{' &&
      [':', '|', '&', '(', ',', '='].includes(previousNonWhitespace(text, i - 1) ?? '');

    if ((char === ';' || (char === '{' && !startsInlineObjectType)) && isTopLevel) {
      return i;
    }

    updateTypeDepth(char, depth);
  }

  return -1;
}

function previousNonWhitespace(text: string, index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const char = text[i];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}

function normalizeSourceParamName(name: string): string | undefined {
  const normalized = name
    .trim()
    .replace(/^\.\.\./, '')
    .split(/\s+/)
    .pop()
    ?.replace(/\?$/, '');

  if (!normalized || normalized.startsWith('{') || normalized.startsWith('[')) {
    return undefined;
  }
  return normalized;
}

function parseSourceParameter(param: string): [string, string] | undefined {
  const colonIndex = findTopLevelChar(param, ':');
  if (colonIndex === -1) return undefined;

  const name = normalizeSourceParamName(param.slice(0, colonIndex));
  if (!name) return undefined;

  let type = param.slice(colonIndex + 1).trim();
  const defaultIndex = findTopLevelChar(type, '=');
  if (defaultIndex !== -1) {
    type = type.slice(0, defaultIndex).trim();
  }
  return [name, type];
}

export function parseSourceSignatureTypesAtLine(
  text: string,
  line: number
): SourceSignatureTypes | undefined {
  const lineOffset = getLineOffset(text, line);
  const openParen = text.indexOf('(', lineOffset);
  if (openParen === -1) return undefined;

  const closeParen = findMatchingParen(text, openParen);
  if (closeParen === -1) return undefined;

  const parameters = new Map<string, string>();
  const paramsText = text.slice(openParen + 1, closeParen).trim();
  for (const param of splitTopLevel(paramsText, ',')) {
    const parsed = parseSourceParameter(param);
    if (parsed) {
      parameters.set(parsed[0], parsed[1]);
    }
  }

  const colonIndex = findReturnTypeColon(text, closeParen + 1);
  if (colonIndex === -1) return { parameters };

  const absoluteReturnStart = colonIndex + 1;
  const returnEnd = findSignatureEnd(text, absoluteReturnStart);
  const returnType =
    returnEnd === -1
      ? text.slice(absoluteReturnStart).trim()
      : text.slice(absoluteReturnStart, returnEnd).trim();

  return { parameters, returnType };
}

function getSourceSignatureTypes(signature: TypeDocSignature): SourceSignatureTypes | undefined {
  const source = signature.sources?.[0];
  if (!source) return undefined;

  const text = getSourceFileText(source.fileName);
  return parseSourceSignatureTypesAtLine(text, source.line);
}

function formatYamlFrontmatterString(value: string): string {
  return JSON.stringify(value);
}

function formatType(type?: TypeDocType, depth = 0): string {
  if (!type) return 'unknown';
  if (depth > 5) return '...'; // Prevent infinite recursion

  switch (type.type) {
    case 'intrinsic':
      return type.name || 'unknown';

    case 'literal':
      if (typeof type.value === 'string') return `'${type.value}'`;
      return String(type.value);

    case 'reference':
      if (type.typeArguments && type.typeArguments.length > 0) {
        const args = type.typeArguments.map(t => formatType(t, depth + 1)).join(', ');
        return `${type.name}<${args}>`;
      }
      return type.name || 'unknown';

    case 'array':
      return `${formatType(type.elementType, depth + 1)}[]`;

    case 'union':
      if (type.types) {
        return type.types.map(t => formatType(t, depth + 1)).join(' | ');
      }
      return 'unknown';

    case 'intersection':
      if (type.types) {
        return type.types.map(t => formatType(t, depth + 1)).join(' & ');
      }
      return 'unknown';

    case 'reflection':
      if (type.declaration?.signatures) {
        // Function type
        const sig = type.declaration.signatures[0];
        const params =
          sig.parameters?.map(p => `${p.name}: ${formatType(p.type, depth + 1)}`).join(', ') || '';
        return `(${params}) => ${formatType(sig.type, depth + 1)}`;
      }
      if (type.declaration?.children) {
        // Object type
        const props = type.declaration.children
          .map(c => {
            const opt = c.flags?.isOptional ? '?' : '';
            return `${c.name}${opt}: ${formatType(c.type, depth + 1)}`;
          })
          .join('; ');
        return `{ ${props} }`;
      }
      return 'object';

    case 'tuple':
      if (type.types) {
        return `[${type.types.map(t => formatType(t, depth + 1)).join(', ')}]`;
      }
      return '[]';

    case 'query':
      return `typeof ${formatType(type.target as TypeDocType, depth + 1)}`;

    case 'typeOperator':
      return type.name || 'unknown';

    default:
      return type.name || 'unknown';
  }
}

function extractMethod(reflection: TypeDocReflection): MethodDoc | null {
  if (!reflection.signatures || reflection.signatures.length === 0) {
    return null;
  }

  const signatures = reflection.signatures.map(sig => {
    const sourceTypes = getSourceSignatureTypes(sig);
    const parameters = (sig.parameters || []).map(param => ({
      // Clean up ugly TypeScript internal names
      name: param.name.startsWith('__') ? 'options' : param.name,
      type: sourceTypes?.parameters.get(param.name) ?? formatType(param.type),
      required: isParameterRequired(param),
      description: extractDescription(param.comment),
      default: param.defaultValue,
    }));

    return {
      parameters,
      returnType: sourceTypes?.returnType ?? formatType(sig.type),
      returnDescription: extractTag(sig.comment, '@returns')[0],
    };
  });

  // Use the first signature's comment for the method description
  const primarySig = reflection.signatures[0];
  const description = extractDescription(primarySig.comment);
  const examples = extractTag(primarySig.comment, '@example');
  // `@deprecated` may live on the signature comment or the reflection comment.
  const deprecated =
    extractTag(primarySig.comment, '@deprecated')[0] ??
    extractTag(reflection.comment, '@deprecated')[0];

  return {
    name: reflection.name,
    description,
    signatures,
    examples,
    isAsync:
      signatures[0]?.returnType.startsWith('Promise') ??
      formatType(primarySig.type).startsWith('Promise'),
    deprecated,
    source: reflection.sources?.[0]
      ? { file: reflection.sources[0].fileName, line: reflection.sources[0].line }
      : undefined,
  };
}

function extractClass(reflection: TypeDocReflection): ClassDoc {
  const classDoc: ClassDoc = {
    name: reflection.name,
    description: extractDescription(reflection.comment),
    methods: [],
    properties: [],
    source: reflection.sources?.[0]
      ? { file: reflection.sources[0].fileName, line: reflection.sources[0].line }
      : undefined,
    deprecated: extractTag(reflection.comment, '@deprecated')[0],
  };

  if (!reflection.children) return classDoc;

  for (const child of reflection.children) {
    // Skip private/protected members
    if (child.flags?.isPrivate || child.flags?.isProtected) continue;

    // Constructor (kind 512)
    if (child.kind === TYPEDOC_KIND.Constructor) {
      const method = extractMethod(child);
      if (method) {
        classDoc.constructor = method;
      }
      continue;
    }

    // Methods (kind 2048)
    if (child.kind === TYPEDOC_KIND.Method) {
      const method = extractMethod(child);
      if (method) {
        classDoc.methods.push(method);
      }
      continue;
    }

    // Properties (kind 1024, public only)
    if (child.kind === TYPEDOC_KIND.Property && !child.flags?.isPrivate) {
      classDoc.properties.push({
        name: child.name,
        type: formatType(child.type),
        description: extractDescription(child.comment),
        default: child.defaultValue,
      });
    }
  }

  return classDoc;
}

// Fence options are a contract between JSDoc, this generator and the
// reference checker: only the generator writes `signature`, and authored
// options such as `nocheck="<reason>"` pass through unchanged.
const SIGNATURE_FENCE = '```typescript signature';
function renderExample(example: string, owner: string): string {
  const rendered = Effect.runSync(Effect.result(renderAuthoredExample(example, owner)));
  if (rendered._tag === 'Failure') throw new Error(rendered.failure.message);
  return rendered.success;
}

function generateMethodMdx(method: MethodDoc, className: string): string {
  const lines: string[] = [];

  // Method header. Flag deprecated methods in the heading so they read clearly
  // in the sidebar/anchor and at a glance.
  const deprecatedSuffix = method.deprecated !== undefined ? ' (deprecated)' : '';
  lines.push(`### ${method.name}()${deprecatedSuffix}`);
  lines.push('');

  // Deprecation callout (rendered as a fumadocs warning callout).
  if (method.deprecated !== undefined) {
    const note = method.deprecated.trim();
    lines.push('<Callout type="warn" title="Deprecated">');
    lines.push(note.length > 0 ? escapeTextForMdx(note) : 'This method is deprecated.');
    lines.push('</Callout>');
    lines.push('');
  }

  // Description
  if (method.description) {
    lines.push(method.description);
    lines.push('');
  }

  // Handle multiple overloads
  for (let i = 0; i < method.signatures.length; i++) {
    const sig = method.signatures[i];

    if (method.signatures.length > 1) {
      lines.push(`**Overload ${i + 1}**`);
      lines.push('');
    }

    // Signature
    const params = sig.parameters
      .map(p => {
        const opt = p.required ? '' : '?';
        const paramType = simplifyTypeForSignature(p.type);
        return `${p.name}${opt}: ${paramType}`;
      })
      .join(', ');
    const asyncPrefix = method.isAsync ? 'async ' : '';
    const returnType = simplifyTypeForSignature(sig.returnType);
    lines.push(SIGNATURE_FENCE);
    lines.push(`${asyncPrefix}${method.name}(${params}): ${returnType}`);
    lines.push('```');
    lines.push('');

    // Parameters table
    if (sig.parameters.length > 0) {
      lines.push('**Parameters**');
      lines.push('');

      // Check if any parameter has a description
      const hasDescriptions = sig.parameters.some(p => p.description);

      if (hasDescriptions) {
        lines.push('| Name | Type | Description |');
        lines.push('|------|------|-------------|');
        for (const param of sig.parameters) {
          const opt = param.required ? '' : '?';
          const desc = escapeTableTextForMdx(param.description || '');
          const typeCell = escapeTypeForMdx(simplifyTypeForTable(param.type));
          lines.push(`| \`${param.name}${opt}\` | \`${typeCell}\` | ${desc} |`);
        }
      } else {
        // No descriptions - use simpler table
        lines.push('| Name | Type |');
        lines.push('|------|------|');
        for (const param of sig.parameters) {
          const opt = param.required ? '' : '?';
          const typeCell = escapeTypeForMdx(simplifyTypeForTable(param.type));
          lines.push(`| \`${param.name}${opt}\` | \`${typeCell}\` |`);
        }
      }
      lines.push('');
    }

    // Return type
    if (sig.returnType !== 'void') {
      lines.push('**Returns**');
      lines.push('');
      const returnTypeDisplay = escapeTypeForMdx(simplifyTypeForTable(sig.returnType));
      let returnLine = `\`${returnTypeDisplay}\``;
      if (sig.returnDescription) {
        returnLine += ` — ${escapeTextForMdx(sig.returnDescription)}`;
      }
      lines.push(returnLine);
      lines.push('');
    }
  }

  // Examples
  if (method.examples.length > 0) {
    lines.push('**Example**');
    lines.push('');
    for (const example of method.examples) {
      lines.push(renderExample(example, `${className}.${method.name}`));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// The Usage section binds the class instance through its real accessor path
// and calls nothing on it, so it stays valid for every class.
function generateUsageMdx(access: AccessPath): string[] {
  const isIdentifier = (name: string) =>
    /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name);
  const accessor =
    'composio' +
    access.path
      .map(name => (isIdentifier(name) ? `.${name}` : `[${JSON.stringify(name)}]`))
      .join('');
  const last = access.path[access.path.length - 1];
  const token = ts
    .createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, last)
    .scan();
  const conflicts = ['Composio', 'composio', 'eval', 'arguments'];
  const binding =
    isIdentifier(last) && token === ts.SyntaxKind.Identifier && !conflicts.includes(last)
      ? last
      : 'instance';
  const delimiter = '`'.repeat(
    Math.max(0, ...[...accessor.matchAll(/`+/g)].map(run => run[0].length)) + 1
  );
  const inlineAccessor = `${delimiter}${accessor}${delimiter}`;
  const lines = ['## Usage', ''];
  if (access.deprecated) {
    lines.push(`The ${inlineAccessor} property is deprecated.`);
    lines.push('');
  }
  lines.push(`Access this class through the ${inlineAccessor} property:`);
  lines.push('');
  lines.push('```typescript');
  lines.push(`import { Composio } from '@composio/core';`);
  lines.push('');
  lines.push(`const composio = new Composio({ apiKey: 'your-api-key' });`);
  lines.push(`const ${binding} = ${accessor};`);
  lines.push('```');
  lines.push('');
  return lines;
}

export function generateClassMdx(classDoc: ClassDoc, access?: AccessPath): string {
  const lines: string[] = [];

  // Build full description for frontmatter (first sentence + additional context)
  const fullDescription = classDoc.description
    ? classDoc.description.replace(/\n/g, ' ').trim()
    : `${classDoc.name} class reference`;

  // Frontmatter - fumadocs renders title and description automatically
  lines.push('---');
  lines.push(`title: ${formatYamlFrontmatterString(displayNameFor(classDoc.name))}`);
  lines.push(`description: ${formatYamlFrontmatterString(fullDescription)}`);
  lines.push('---');
  lines.push('');

  // Class-level deprecation callout (rendered as a fumadocs warning callout).
  if (classDoc.deprecated !== undefined) {
    const note = classDoc.deprecated.trim();
    lines.push('<Callout type="warn" title="Deprecated">');
    lines.push(note.length > 0 ? escapeTextForMdx(note) : 'This class is deprecated.');
    lines.push('</Callout>');
    lines.push('');
  }

  // Content starts directly with Constructor or Usage (no duplicate title/description)

  // Constructor - only show for user-instantiated classes
  if (classDoc.constructor && USER_INSTANTIATED_CLASSES.has(classDoc.name)) {
    lines.push('## Constructor');
    lines.push('');
    lines.push(generateMethodMdx(classDoc.constructor, classDoc.name));
  } else if (access && !USER_INSTANTIATED_CLASSES.has(classDoc.name)) {
    lines.push(...generateUsageMdx(access));
  }

  // Properties (if any public ones exist)
  const publicProps = classDoc.properties.filter(p => !p.name.startsWith('_'));
  if (publicProps.length > 0) {
    lines.push('## Properties');
    lines.push('');

    // Check if any property has a description
    const hasDescriptions = publicProps.some(p => p.description);

    if (hasDescriptions) {
      lines.push('| Name | Type | Description |');
      lines.push('|------|------|-------------|');
      for (const prop of publicProps) {
        const typeCell = escapeTypeForMdx(simplifyTypeForTable(prop.type));
        const safeDesc = escapeTableTextForMdx(prop.description || '');
        lines.push(`| \`${prop.name}\` | \`${typeCell}\` | ${safeDesc} |`);
      }
    } else {
      lines.push('| Name | Type |');
      lines.push('|------|------|');
      for (const prop of publicProps) {
        const typeCell = escapeTypeForMdx(simplifyTypeForTable(prop.type));
        lines.push(`| \`${prop.name}\` | \`${typeCell}\` |`);
      }
    }
    lines.push('');
  }

  // Methods
  if (classDoc.methods.length > 0) {
    lines.push('## Methods');
    lines.push('');
    for (const method of classDoc.methods) {
      lines.push(generateMethodMdx(method, classDoc.name));
    }
  }

  return lines.join('\n');
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

// Escape text content for MDX (descriptions, etc. that appear outside backticks)
// Handles both curly braces and angle brackets (which MDX interprets as JSX tags)
export function escapeTextForMdx(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeTableTextForMdx(str: string): string {
  return escapeTextForMdx(str).replace(/\s*\n\s*/g, ' ');
}

// Clean up internal generic type parameters that don't add value for users
function cleanupGenericTypes(type: string): string {
  // Remove generic parameters that are just implementation details
  // e.g., "Tools<unknown, unknown, TProvider>" -> "Tools"
  // e.g., "Composio<TProvider>" -> "Composio"
  // e.g., "Uint8Array<ArrayBufferLike>" -> "Uint8Array"
  let cleaned = type;

  // Remove type parameters that are just unknowns or TProvider
  cleaned = cleaned.replace(/<unknown(?:,\s*unknown)*(?:,\s*TProvider)?>/g, '');
  cleaned = cleaned.replace(/<TProvider>/g, '');
  cleaned = cleaned.replace(/<unknown>/g, '');

  // Remove TypeScript internal generic parameters (e.g., <ArrayBufferLike>)
  // that add no value for users and break MDX parsing
  cleaned = cleaned.replace(/<ArrayBufferLike>/g, '');

  // Clean up double spaces and trailing commas
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Escape type strings for safe use in MDX backtick code spans.
// Escapes backslashes first so later Markdown escapes cannot be neutralized.
export function escapeTypeForMdx(type: string): string {
  return type
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\|/g, '\\|');
}

function isInlineObjectType(type: string): boolean {
  return type.startsWith('{') || type.includes(': {');
}

// Shorten a type to at most `maxLength` characters. A union is cut between
// members, or elided entirely when not even its first member fits, so it never
// ends inside a string literal.
function truncateType(type: string, maxLength: number): string {
  const members = splitTopLevel(type, '|');
  if (members.length > 1) {
    const suffix = ' | ...';
    let kept = members[0];
    for (const member of members.slice(1)) {
      const next = `${kept} | ${member}`;
      if (next.length + suffix.length > maxLength) break;
      kept = next;
    }
    return kept.length + suffix.length <= maxLength ? kept + suffix : '...';
  }
  return type.substring(0, maxLength - 3) + '...';
}

// Simplify complex types for table display while preserving public object shapes.
export function simplifyTypeForTable(type: string): string {
  // First clean up internal generics
  const cleaned = cleanupGenericTypes(type);

  if (isInlineObjectType(cleaned)) {
    return cleaned;
  }

  // If type is too long or complex, simplify it
  if (cleaned.length > 80) {
    // Extract just the outer type name if it's a generic
    const genericMatch = cleaned.match(/^([A-Za-z]+)<.*>$/);
    if (genericMatch) {
      return `${genericMatch[1]}<...>`;
    }

    // For function types, simplify
    if (cleaned.includes('=>')) {
      const returnMatch = cleaned.match(/=>\s*(.+)$/);
      const returnType = returnMatch ? returnMatch[1] : 'unknown';
      return `(...) => ${simplifyTypeForTable(returnType)}`;
    }

    // Truncate very long types
    if (cleaned.length > 80) {
      return truncateType(cleaned, 80);
    }
  }
  return cleaned;
}

// Simplify types for code block display (less aggressive, preserves structure)
export function simplifyTypeForSignature(type: string): string {
  // First clean up internal generics
  const cleaned = cleanupGenericTypes(type);

  if (isInlineObjectType(cleaned)) {
    return cleaned;
  }

  // Keep types under 100 chars as-is
  if (cleaned.length <= 100) {
    return cleaned;
  }

  // For Promise<...> with complex inner type, simplify inner
  const promiseMatch = cleaned.match(/^Promise<(.+)>$/);
  if (promiseMatch) {
    const inner = promiseMatch[1];
    if (inner.length > 60 || inner.includes(': {')) {
      return 'Promise<...>';
    }
  }

  // For generics with complex type arguments
  const genericMatch = cleaned.match(/^([A-Za-z]+)<(.+)>$/);
  if (genericMatch) {
    const [, name, args] = genericMatch;
    if (args.length > 60 || args.includes(': {')) {
      return `${name}<...>`;
    }
  }

  // Truncate very long types
  if (cleaned.length > 100) {
    return truncateType(cleaned, 100);
  }

  return cleaned;
}

async function runTypeDoc(): Promise<unknown> {
  console.log('Running TypeDoc...');

  // Auto-discover entry points from models directory
  const modelFiles = await discoverModelFiles();
  const entryPoints = ['src/composio.ts', ...modelFiles];

  console.log(`  Found ${entryPoints.length} entry points`);

  try {
    runTypeDocCommand(entryPoints);
  } catch (error) {
    console.error('TypeDoc failed:', error);
    throw error;
  }

  const jsonContent = await readFile(TEMP_JSON, 'utf-8');
  return JSON.parse(jsonContent);
}

async function main() {
  console.log('Starting TypeScript SDK documentation generation...\n');
  console.log(`Package dir: ${PACKAGE_DIR}`);
  console.log(`Output dir: ${OUTPUT_DIR}\n`);

  // Clean output directory
  try {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Run TypeDoc
  const typeDocJson = await runTypeDoc();
  const accessPaths = new TypeDocClassCatalog(parseTypeDocGraph(typeDocJson)).accessPaths();
  // Class extraction reads many more TypeDoc fields than the Usage walk; it
  // still relies on the TypeDoc schema the interfaces above describe.
  const project = typeDocJson as TypeDocProject;

  if (!project.children) {
    throw new Error('No classes found in TypeDoc output');
  }

  const catalog = new TypeDocClassCatalog(project);
  const classesToDocument = catalog.documentedNames();
  console.log(
    `  Found ${classesToDocument.length} classes to document: ${classesToDocument.join(', ')}`
  );

  // Find and document each class
  const documented: { name: string; description: string }[] = [];

  for (const className of classesToDocument) {
    const reflection = catalog.byName(className);

    if (!reflection) {
      console.warn(`  Warning: ${className} not found in TypeDoc output`);
      continue;
    }

    console.log(`  Processing ${className}...`);

    const classDoc = extractClass(reflection);
    const mdx = generateClassMdx(classDoc, accessPaths.get(className));
    const fileName = slugFor(className) + '.mdx';
    const filePath = join(OUTPUT_DIR, fileName);

    await writeFile(filePath, mdx);
    documented.push({
      name: className,
      description: classDoc.description.split('\n')[0] || `${className} API`,
    });
  }

  // Generate index page
  const classesTable = documented
    .map(
      ({ name, description }) =>
        `| [\`${displayNameFor(name)}\`](/reference/sdk-reference/typescript/${slugFor(name)}) | ${escapeTableTextForMdx(description)} |`
    )
    .join('\n');

  const indexContent = `---
title: ${formatYamlFrontmatterString('TypeScript SDK Reference')}
description: ${formatYamlFrontmatterString('Complete API reference for the Composio TypeScript SDK (@composio/core).')}
---

## Installation

<PackageInstall packages="@composio/core" />

## Classes

| Class | Description |
|-------|-------------|
${classesTable}

## Quick Start

\`\`\`typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY
});

// Get tools for a user
const tools = await composio.tools.get('user-123', {
  toolkits: ['github']
});

// Execute a tool
const result = await composio.tools.execute('GITHUB_GET_REPOS', {
  userId: 'user-123',
  arguments: { owner: 'composio' },
  version: '20250909_00'
});
\`\`\`
`;

  await writeFile(join(OUTPUT_DIR, 'index.mdx'), indexContent);

  // Generate meta.json for sidebar
  const meta = {
    title: 'TypeScript SDK',
    pages: documented.map(({ name }) => slugFor(name)),
  };
  await writeFile(join(OUTPUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

  // Clean up temp file
  try {
    await rm(TEMP_JSON);
  } catch {
    // Ignore cleanup errors
  }

  console.log('\nGeneration complete!');
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Classes: ${documented.map(d => d.name).join(', ')}`);
  console.log(`  Files generated: ${documented.length + 2}`); // +2 for index.mdx and meta.json
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href);
}

if (isDirectRun()) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
