/**
 * TypeScript SDK Documentation Generator
 *
 * Generates MDX documentation from TypeScript source code using TypeDoc.
 * Output is written to the fumadocs content directory.
 *
 * Run: pnpm --filter @composio/core generate:docs
 */

import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Paths (relative to ts/packages/core)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SCRIPT_DIR, '..');
const MODELS_DIR = join(PACKAGE_DIR, 'src/models');
const OUTPUT_DIR = join(
  PACKAGE_DIR,
  '../../../fumadocs/content/reference/sdk-reference/typescript'
);
const TEMP_JSON = join(PACKAGE_DIR, '.typedoc-output.json');

// Internal classes that should NOT be documented (accessed via other APIs)
const INTERNAL_CLASSES = new Set([
  'CustomTools', // Internal - accessed via composio.tools.createCustomTool()
  'AuthScheme', // Utility class
  'ConnectionRequest', // Utility
  'Files', // Not yet stable API
  'MCP', // Experimental
  'ToolRouter', // Experimental
]);

// Classes that users instantiate directly (show constructor)
const USER_INSTANTIATED_CLASSES = new Set(['Composio']);

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
}

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

  // Clean up API paths that shouldn't be in user-facing docs
  desc = desc.replace(/\/?api\/v\d+\/[^\s]*/g, '').trim();

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
    const parameters = (sig.parameters || []).map(param => ({
      // Clean up ugly TypeScript internal names
      name: param.name.startsWith('__') ? 'options' : param.name,
      type: formatType(param.type),
      required: !param.flags?.isOptional,
      description: extractDescription(param.comment),
      default: param.defaultValue,
    }));

    return {
      parameters,
      returnType: formatType(sig.type),
      returnDescription: extractTag(sig.comment, '@returns')[0],
    };
  });

  // Use the first signature's comment for the method description
  const primarySig = reflection.signatures[0];
  const description = extractDescription(primarySig.comment);
  const examples = extractTag(primarySig.comment, '@example');

  return {
    name: reflection.name,
    description,
    signatures,
    examples,
    isAsync: formatType(primarySig.type).startsWith('Promise'),
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

  // Method header
  lines.push(`### ${method.name}()`);
  lines.push('');

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
          const desc = escapeForMdx(param.description || '');
          const safeType = escapeForMdx(simplifyTypeForTable(param.type));
          lines.push(`| \`${param.name}${opt}\` | \`${safeType}\` | ${desc} |`);
        }
      } else {
        // No descriptions - use simpler table
        lines.push('| Name | Type |');
        lines.push('|------|------|');
        for (const param of sig.parameters) {
          const opt = param.required ? '' : '?';
          const safeType = escapeForMdx(simplifyTypeForTable(param.type));
          lines.push(`| \`${param.name}${opt}\` | \`${safeType}\` |`);
        }
      }
      lines.push('');
    }

    // Return type
    if (sig.returnType !== 'void') {
      lines.push('**Returns**');
      lines.push('');
      const safeReturnType = escapeForMdx(simplifyTypeForTable(sig.returnType));
      let returnLine = `\`${safeReturnType}\``;
      if (sig.returnDescription) {
        returnLine += ` — ${sig.returnDescription}`;
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
  lines.push(`title: ${classDoc.name}`);
  lines.push(`description: ${fullDescription}`);
  lines.push('---');
  lines.push('');

  // Content starts directly with Constructor or Usage (no duplicate title/description)

  // Constructor - only show for user-instantiated classes
  if (classDoc.constructor && USER_INSTANTIATED_CLASSES.has(classDoc.name)) {
    lines.push('## Constructor');
    lines.push('');
    lines.push(generateMethodMdx(classDoc.constructor));
  } else if (!USER_INSTANTIATED_CLASSES.has(classDoc.name)) {
    // Show usage hint for non-instantiated classes
    const accessorName = classDoc.name.charAt(0).toLowerCase() + classDoc.name.slice(1);
    lines.push('## Usage');
    lines.push('');
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
        const safeType = escapeForMdx(simplifyTypeForTable(prop.type));
        const safeDesc = escapeForMdx(prop.description || '');
        lines.push(`| \`${prop.name}\` | \`${safeType}\` | ${safeDesc} |`);
      }
    } else {
      lines.push('| Name | Type |');
      lines.push('|------|------|');
      for (const prop of publicProps) {
        const safeType = escapeForMdx(simplifyTypeForTable(prop.type));
        lines.push(`| \`${prop.name}\` | \`${safeType}\` |`);
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

// Escape curly braces for MDX (they're interpreted as JSX expressions)
function escapeForMdx(str: string): string {
  return str.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

// Clean up internal generic type parameters that don't add value for users
function cleanupGenericTypes(type: string): string {
  // Remove generic parameters that are just implementation details
  // e.g., "Tools<unknown, unknown, TProvider>" -> "Tools"
  // e.g., "Composio<TProvider>" -> "Composio"
  let cleaned = type;

  // Remove type parameters that are just unknowns or TProvider
  cleaned = cleaned.replace(/<unknown(?:,\s*unknown)*(?:,\s*TProvider)?>/g, '');
  cleaned = cleaned.replace(/<TProvider>/g, '');
  cleaned = cleaned.replace(/<unknown>/g, '');

  // Clean up double spaces and trailing commas
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Simplify complex types for table display (aggressive)
function simplifyTypeForTable(type: string): string {
  // First clean up internal generics
  const cleaned = cleanupGenericTypes(type);

  // If type is too long or complex, simplify it
  if (cleaned.length > 80 || (cleaned.includes('{') && cleaned.includes('}'))) {
    // Extract just the outer type name if it's a generic
    const genericMatch = cleaned.match(/^([A-Za-z]+)<.*>$/);
    if (genericMatch) {
      return `${genericMatch[1]}<...>`;
    }

    // For object types, just show 'object'
    if (cleaned.startsWith('{') || cleaned.includes(': {')) {
      return 'object';
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
function simplifyTypeForSignature(type: string): string {
  // First clean up internal generics
  const cleaned = cleanupGenericTypes(type);

  // Keep types under 100 chars as-is
  if (cleaned.length <= 100 && !cleaned.includes(': {')) {
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

  // For inline object types in signatures
  if (cleaned.includes(': {') || (cleaned.startsWith('{') && cleaned.length > 60)) {
    return 'object';
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
    'bunx typedoc',
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
    const fileName = toKebabCase(className) + '.mdx';
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
        `| [\`${name}\`](/reference/sdk-reference/typescript/${toKebabCase(name)}) | ${escapeForMdx(description)} |`
    )
    .join('\n');

  const indexContent = `---
title: TypeScript SDK Reference
description: Complete API reference for the Composio TypeScript SDK (@composio/core).
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
    pages: documented.map(({ name }) => toKebabCase(name)),
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

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
