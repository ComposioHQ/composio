#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import readline from 'readline';

const PAGES_SRC_DIR = path.join(import.meta.dir, '../pages/src');
const SNIPPETS_DIR = path.join(import.meta.dir, '../snippets');

const FEATURES = [
  'get-started',
  'tool-calling',
  'authentication',
  'triggers',
  'providers',
  'examples',
  'migration',
  'mcp',
];

const DOC_TYPES = ['guide', 'example', 'provider', 'reference'];

const DOC_TEMPLATES: Record<string, (name: string) => string> = {
  guide: (name: string) => `---
title: ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
description: ""
keywords: ""
subtitle: ""
hide-nav-links: false
---

## Introduction

[Add your introduction here]

## Getting Started

[Add getting started content]

## Examples

[Add examples here]

## Next Steps

[Add next steps]
`,
  example: (name: string) => `---
title: ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
description: ""
keywords: ""
subtitle: ""
hide-nav-links: true
---

This example demonstrates...

## Prerequisites

- [List prerequisites]

## Implementation

[Add implementation details]

## Running the Example

[Add instructions]

## Next Steps

[Add next steps]
`,
  provider: (name: string) => `---
title: ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Provider
slug: /providers/${name}
image: "https://og.composio.dev/api/og?title=${encodeURIComponent(name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))}%20Provider"
keywords: ""
hide-nav-links: false
---

The ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Provider transforms Composio tools into a format compatible with ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}'s function calling capabilities.

## Setup

<CodeGroup>
\`\`\`typescript TypeScript
npm install @composio/${name}
\`\`\`
\`\`\`python Python
pip install composio[${name}]
\`\`\`
</CodeGroup>

## Usage

<Tabs>
<Tab title="TypeScript">
<SnippetCode
  src="fern/snippets/providers/typescript/${name}.ts"
  title="${name}-provider.ts"
/>
</Tab>
<Tab title="Python">
<SnippetCode
  src="fern/snippets/providers/python/${name}.py"
  title="${name}-provider.py"
/>
</Tab>
</Tabs>
`,
  reference: (name: string) => `---
title: ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
description: ""
keywords: ""
subtitle: ""
hide-nav-links: false
---

## Overview

[Add overview]

## API Reference

[Add API reference]

## Examples

[Add examples]
`,
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function validateFeature(feature: string): boolean {
  return FEATURES.includes(feature);
}

function validateDocType(type: string): boolean {
  return DOC_TYPES.includes(type);
}

async function createDoc(feature: string, name: string, type: string) {
  if (!validateFeature(feature)) {
    console.error(`❌ Invalid feature: ${feature}`);
    console.log(`Valid features: ${FEATURES.join(', ')}`);
    process.exit(1);
  }

  if (!validateDocType(type)) {
    console.error(`❌ Invalid type: ${type}`);
    console.log(`Valid types: ${DOC_TYPES.join(', ')}`);
    process.exit(1);
  }

  const featureDir = path.join(PAGES_SRC_DIR, feature);
  const fileName = `${name}.mdx`;
  const filePath = path.join(featureDir, fileName);

  // Create directory if it doesn't exist
  if (!fs.existsSync(featureDir)) {
    fs.mkdirSync(featureDir, { recursive: true });
    console.log(`📁 Created directory: ${path.relative(PAGES_SRC_DIR, featureDir)}`);
  }

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(`❌ File already exists: ${path.relative(PAGES_SRC_DIR, filePath)}`);
    process.exit(1);
  }

  // Write the template
  const template = DOC_TEMPLATES[type];
  fs.writeFileSync(filePath, template(name));
  console.log(`✅ Created doc: ${path.relative(PAGES_SRC_DIR, filePath)}`);

  // Ask about creating snippet files
  if (type === 'provider' || type === 'example') {
    const createSnippets = await question('\n📝 Create matching snippet files? (y/n): ');
    if (createSnippets.toLowerCase() === 'y') {
      await createMatchingSnippets(feature, name);
    }
  }

  // Show navigation update suggestion
  console.log(`\n📋 To add this to navigation, update fern/docs.yml:`);
  console.log(`    - page: ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`);
  console.log(`      path: pages/dist/${feature}/${fileName}`);
  if (type === 'provider') {
    console.log(`      slug: ${name}`);
  }

  rl.close();
}

async function createMatchingSnippets(feature: string, name: string) {
  const languages = ['python', 'typescript'];
  const extensions = { python: 'py', typescript: 'ts' };

  for (const lang of languages) {
    const snippetFeatureDir = path.join(SNIPPETS_DIR, feature, lang);
    const snippetFileName = `${name}.${extensions[lang]}`;
    const snippetFilePath = path.join(snippetFeatureDir, snippetFileName);

    // Create directory if it doesn't exist
    if (!fs.existsSync(snippetFeatureDir)) {
      fs.mkdirSync(snippetFeatureDir, { recursive: true });
    }

    // Skip if file exists
    if (fs.existsSync(snippetFilePath)) {
      console.log(`⚠️  Snippet already exists: ${path.relative(SNIPPETS_DIR, snippetFilePath)}`);
      continue;
    }

    // Create snippet with boilerplate
    const boilerplate = lang === 'python' 
      ? `from composio import Composio\n\n# Initialize Composio client\ncomposio = Composio()\n\n# TODO: Add ${name} provider example\n`
      : `import { Composio } from '@composio/core';\n\n// Initialize Composio client\nconst composio = new Composio();\n\n// TODO: Add ${name} provider example\n`;

    fs.writeFileSync(snippetFilePath, boilerplate);
    console.log(`✅ Created snippet: ${path.relative(SNIPPETS_DIR, snippetFilePath)}`);
  }
}

function showHelp() {
  console.log(`
Usage: pnpm doc:new --feature=<feature> --name=<name> --type=<type>

Options:
  --feature   The feature category (required)
              Valid values: ${FEATURES.join(', ')}
  
  --name      The name of the doc file (required)
              Will be saved as <name>.mdx
  
  --type      The type of documentation (required)
              Valid values: ${DOC_TYPES.join(', ')}
  
  --help      Show this help message

Examples:
  pnpm doc:new --feature=providers --name=gemini --type=provider
  pnpm doc:new --feature=examples --name=calendar-sync --type=example
  pnpm doc:new --feature=authentication --name=oauth-flow --type=guide
`);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      feature: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const { feature, name, type } = values;

  if (!feature || !name || !type) {
    console.error('❌ Missing required arguments');
    showHelp();
    process.exit(1);
  }

  await createDoc(feature, name, type);
}

main();