/**
 * Checks invariants in generated TypeScript SDK reference docs.
 *
 * Run after `pnpm --filter @composio/core generate:docs`.
 */

import { readdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SCRIPT_DIR, '..');
const REFERENCE_DIR = join(PACKAGE_DIR, '../../../docs/content/reference/sdk-reference/typescript');

type RequiredText = {
  file: string;
  text: string;
  description: string;
};

type ForbiddenText = {
  file?: string;
  text: string;
  description: string;
};

type ForbiddenPattern = {
  file?: string;
  pattern: RegExp;
  description: string;
};

const requiredTexts: RequiredText[] = [
  {
    file: 'composio.mdx',
    text: '| `experimental` | `Experimental` |',
    description: 'Composio.experimental is documented as a public property',
  },
  {
    file: 'composio.mdx',
    text: 'async create(userId: string, routerConfig?: ToolRouterCreateSessionConfig): Promise<Session>',
    description: 'Composio.create() is documented with its public signature',
  },
  {
    file: 'composio.mdx',
    text: 'getClient(): ComposioClient',
    description: 'Composio.getClient() returns the SDK client, not another Composio instance',
  },
  {
    file: 'tool-router-session.mdx',
    text: '| `experimental` | `SessionExperimental` | Experimental session features',
    description: 'ToolRouterSession.experimental is documented as a public property',
  },
  {
    file: 'tool-router-session.mdx',
    text: 'async authorize(toolkit: string, options?: ToolRouterAuthorizeOptions): Promise<ConnectionRequest>',
    description: 'ToolRouterSession.authorize() is documented with its public signature',
  },
  {
    file: 'tool-router-session.mdx',
    text: 'async toolkits(options?: ToolRouterToolkitsOptions): Promise<ToolkitConnectionsDetails>',
    description: 'ToolRouterSession.toolkits() is documented with its public signature',
  },
  {
    file: 'tools.mdx',
    text: 'async execute(slug: string, body: ToolExecuteParams, modifiers?: ExecuteToolModifiers): Promise<ToolExecuteResponse>',
    description: 'Tools.execute() is documented with its public signature',
  },
  {
    file: 'tools.mdx',
    text: 'async getRawToolRouterSessionTools(sessionId: string, options?: SchemaModifierOptions): Promise<ToolList>',
    description: 'Tools.getRawToolRouterSessionTools() is documented',
  },
];

const forbiddenTexts: ForbiddenText[] = [
  {
    text: 'composio.sessionContextImpl',
    description: 'internal SessionContextImpl access path leaked into docs',
  },
  {
    text: 'composio.remoteFile',
    description: 'RemoteFile should not be documented as a Composio root property',
  },
  {
    text: 'composio.toolRouterSession',
    description: 'ToolRouterSession should not be documented as a Composio root property',
  },
  {
    text: 'composio.toolRouterSessionFilesMount',
    description: 'ToolRouterSessionFilesMount should not be documented as a Composio root property',
  },
  {
    text: 'executeMetaTool',
    description: 'stale/internal meta-tool helper leaked into docs',
  },
  {
    text: 'getRawToolRouterMetaTools',
    description: 'stale/internal raw meta-tool helper leaked into docs',
  },
  {
    text: 'tools.list(',
    description: 'stale Tools.list() call leaked into docs',
  },
  {
    text: '| `create` | `object`',
    description: 'Composio.create() was rendered as an object property instead of a method',
  },
  {
    text: 'getConfig(): ComposioConfig',
    description: 'Composio.getConfig() should not be documented as returning mutable config',
  },
  {
    text: 'Promise<...>',
    description: 'placeholder Promise return type leaked into docs',
  },
  {
    text: '{ ... }',
    description: 'placeholder object type leaked into docs',
  },
];

const forbiddenPatterns: ForbiddenPattern[] = [
  {
    pattern: /\bgetClient\(\):\s+Composio\b/,
    description: 'Composio.getClient() should not be documented as returning Composio',
  },
  {
    pattern: /\bgetConfig\(\):\s+ComposioConfig\b/,
    description: 'Composio.getConfig() should not be documented as returning mutable config',
  },
  {
    pattern: /\bPromise<\.\.\.>/,
    description: 'placeholder Promise return type leaked into docs',
  },
  {
    pattern: /\{ \.\.\. \}/,
    description: 'placeholder object type leaked into docs',
  },
];

async function readReferenceFile(file: string): Promise<string> {
  return readFile(join(REFERENCE_DIR, file), 'utf8');
}

async function main() {
  const errors: string[] = [];
  const mdxFiles = (await readdir(REFERENCE_DIR)).filter(file => file.endsWith('.mdx'));
  const mdxByFile = new Map<string, string>();

  for (const file of mdxFiles) {
    mdxByFile.set(file, await readReferenceFile(file));
  }

  for (const { file, text, description } of requiredTexts) {
    const content = mdxByFile.get(file);
    if (!content) {
      errors.push(`${file}: missing file required for ${description}`);
      continue;
    }
    if (!content.includes(text)) {
      errors.push(`${file}: missing expected text for ${description}`);
    }
  }

  const docsToCheck = (file?: string) => {
    if (file) {
      const content = mdxByFile.get(file);
      return content ? [[file, content] as const] : [];
    }
    return [...mdxByFile.entries()];
  };

  for (const { file, text, description } of forbiddenTexts) {
    for (const [candidateFile, content] of docsToCheck(file)) {
      if (content.includes(text)) {
        errors.push(`${candidateFile}: forbidden text found for ${description}: ${text}`);
      }
    }
  }

  for (const { file, pattern, description } of forbiddenPatterns) {
    for (const [candidateFile, content] of docsToCheck(file)) {
      if (pattern.test(content)) {
        errors.push(`${candidateFile}: forbidden pattern found for ${description}: ${pattern}`);
      }
    }
  }

  for (const [file, content] of mdxByFile) {
    const codeFenceCount = content.match(/^```/gm)?.length ?? 0;
    if (codeFenceCount % 2 !== 0) {
      errors.push(`${file}: unbalanced code fences`);
    }
  }

  const meta = JSON.parse(await readReferenceFile('meta.json')) as { pages?: unknown };
  if (!Array.isArray(meta.pages)) {
    errors.push('meta.json: pages must be an array');
  } else {
    const pages = new Set(meta.pages);
    for (const page of ['experimental', 'files', 'tool-router']) {
      if (!pages.has(page)) {
        errors.push(`meta.json: missing expected page "${page}"`);
      }
    }
    for (const page of ['session-context-impl']) {
      if (pages.has(page)) {
        errors.push(`meta.json: internal page "${page}" must not be generated`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Generated TypeScript SDK reference docs failed invariant checks:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Generated TypeScript SDK reference docs passed invariant checks.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
