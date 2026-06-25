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
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

// Paths (relative to ts/packages/core)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SCRIPT_DIR, '..');
const MODELS_DIR = join(PACKAGE_DIR, 'src/models');
const OUTPUT_DIR = join(PACKAGE_DIR, '../../../docs/content/reference/sdk-reference/typescript');
const TEMP_JSON = join(PACKAGE_DIR, '.typedoc-output.json');

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

// Discover model files automatically
async function discoverModelFiles(): Promise<string[]> {
  const files = await readdir(MODELS_DIR);
  return files
    .filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'))
    .map(f => `src/models/${f}`);
}

// Discover classes to document from TypeDoc output
function discoverClassesToDocument(project: TypeDocProject): string[] {
  const classes: string[] = [];

  // Always include Composio first
  classes.push('Composio');

  if (!project.children) return classes;

  for (const child of project.children) {
    // Direct class
    if (child.kind === TYPEDOC_KIND.Class && !INTERNAL_CLASSES.has(child.name)) {
      if (!classes.includes(child.name)) {
        classes.push(child.name);
      }
    }

    // Class inside a module
    if (child.kind === TYPEDOC_KIND.Module && child.children) {
      for (const nested of child.children) {
        if (nested.kind === TYPEDOC_KIND.Class && !INTERNAL_CLASSES.has(nested.name)) {
          if (!classes.includes(nested.name)) {
            classes.push(nested.name);
          }
        }
      }
    }
  }

  return classes;
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

// Helper to find a class by name, searching through modules
function findClass(project: TypeDocProject, className: string): TypeDocReflection | undefined {
  if (!project.children) return undefined;

  for (const child of project.children) {
    // Check if this child is the class we're looking for
    if (child.name === className && child.kind === TYPEDOC_KIND.Class) {
      return child;
    }

    // If it's a module, search inside it
    if (child.kind === TYPEDOC_KIND.Module && child.children) {
      for (const nested of child.children) {
        if (nested.name === className && nested.kind === TYPEDOC_KIND.Class) {
          return nested;
        }
      }
    }
  }

  return undefined;
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

function getSourceFileText(fileName: string): string | undefined {
  const filePath = join(PACKAGE_DIR, 'src', fileName);
  const cached = sourceFileCache.get(filePath);
  if (cached !== undefined) return cached;

  try {
    const text = readFileSync(filePath, 'utf-8');
    sourceFileCache.set(filePath, text);
    return text;
  } catch {
    return undefined;
  }
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
  if (!text) return undefined;

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
      required: !param.flags?.isOptional,
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

function generateMethodMdx(method: MethodDoc): string {
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
    lines.push('```typescript');
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
          const desc = escapeTextForMdx(param.description || '');
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
      // Clean up the example - remove surrounding ```typescript blocks if present
      let cleanExample = example.trim();
      if (cleanExample.startsWith('```typescript')) {
        cleanExample = cleanExample.slice('```typescript'.length);
      }
      if (cleanExample.startsWith('```ts')) {
        cleanExample = cleanExample.slice('```ts'.length);
      }
      if (cleanExample.endsWith('```')) {
        cleanExample = cleanExample.slice(0, -3);
      }
      cleanExample = cleanExample.trim();

      lines.push('```typescript');
      lines.push(cleanExample);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateClassMdx(classDoc: ClassDoc): string {
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
    lines.push(generateMethodMdx(classDoc.constructor));
  } else if (!USER_INSTANTIATED_CLASSES.has(classDoc.name) && !(classDoc.name in SLUG_OVERRIDES)) {
    // Skip the `composio.<accessor>` Usage block for session-object classes —
    // they are not accessed as a `composio` sub-client property; the class
    // description explains how to obtain them (via `composio.sessions`).
    lines.push('## Usage');
    lines.push('');

    // Handle acronyms (e.g., "MCP" -> "mcp") vs PascalCase (e.g., "AuthConfigs" -> "authConfigs")
    const accessorName =
      classDoc.name === classDoc.name.toUpperCase()
        ? classDoc.name.toLowerCase()
        : classDoc.name.charAt(0).toLowerCase() + classDoc.name.slice(1);
    lines.push(`Access this class through the \`composio.${accessorName}\` property:`);
    lines.push('');
    lines.push('```typescript');
    lines.push(`const composio = new Composio({ apiKey: 'your-api-key' });`);
    lines.push(`const result = await composio.${accessorName}.list();`);
    lines.push('```');
    lines.push('');
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
        const safeDesc = escapeTextForMdx(prop.description || '');
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
      lines.push(generateMethodMdx(method));
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
function escapeTextForMdx(str: string): string {
  return str
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
      return cleaned.substring(0, 77) + '...';
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
    return cleaned.substring(0, 97) + '...';
  }

  return cleaned;
}

async function runTypeDoc(): Promise<TypeDocProject> {
  console.log('Running TypeDoc...');

  // Auto-discover entry points from models directory
  const modelFiles = await discoverModelFiles();
  const entryPoints = ['src/composio.ts', ...modelFiles];

  console.log(`  Found ${entryPoints.length} entry points`);

  const cmd = [
    'npx typedoc',
    '--json',
    TEMP_JSON,
    '--tsconfig',
    'tsconfig.json',
    '--excludePrivate',
    '--excludeProtected',
    '--excludeInternal',
    '--skipErrorChecking', // Skip TS errors, we just want the documentation
    ...entryPoints,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', cwd: PACKAGE_DIR });
  } catch (error) {
    console.error('TypeDoc failed:', error);
    throw error;
  }

  const jsonContent = await readFile(TEMP_JSON, 'utf-8');
  return JSON.parse(jsonContent) as TypeDocProject;
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
  const project = await runTypeDoc();

  if (!project.children) {
    throw new Error('No classes found in TypeDoc output');
  }

  // Auto-discover classes to document (excludes internal classes)
  const classesToDocument = discoverClassesToDocument(project);
  console.log(
    `  Found ${classesToDocument.length} classes to document: ${classesToDocument.join(', ')}`
  );

  // Find and document each class
  const documented: { name: string; description: string }[] = [];

  for (const className of classesToDocument) {
    const reflection = findClass(project, className);

    if (!reflection) {
      console.warn(`  Warning: ${className} not found in TypeDoc output`);
      continue;
    }

    console.log(`  Processing ${className}...`);

    const classDoc = extractClass(reflection);
    const mdx = generateClassMdx(classDoc);
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
        `| [\`${displayNameFor(name)}\`](/reference/sdk-reference/typescript/${slugFor(name)}) | ${escapeTextForMdx(description)} |`
    )
    .join('\n');

  const indexContent = `---
title: ${formatYamlFrontmatterString('TypeScript SDK Reference')}
description: ${formatYamlFrontmatterString('Complete API reference for the Composio TypeScript SDK (@composio/core).')}
---

## Installation

<Tabs groupId="package-manager" items={['npm', 'pnpm', 'yarn', 'bun']} persist>
<Tab value="npm">
\`\`\`bash
npm install @composio/core
\`\`\`
</Tab>
<Tab value="pnpm">
\`\`\`bash
pnpm add @composio/core
\`\`\`
</Tab>
<Tab value="yarn">
\`\`\`bash
yarn add @composio/core
\`\`\`
</Tab>
<Tab value="bun">
\`\`\`bash
bun add @composio/core
\`\`\`
</Tab>
</Tabs>

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
  arguments: { owner: 'composio' }
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
