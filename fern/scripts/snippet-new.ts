#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

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

const LANGUAGES = ['python', 'typescript'];

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: 'py',
  typescript: 'ts',
};

const LANGUAGE_BOILERPLATES: Record<string, string> = {
  python: `from composio import Composio

# Initialize Composio client
composio = Composio()

# TODO: Add your code here
`,
  typescript: `import { Composio } from '@composio/core';

// Initialize Composio client
const composio = new Composio();

// TODO: Add your code here
`,
};

function validateFeature(feature: string): boolean {
  return FEATURES.includes(feature);
}

function validateLanguage(lang: string): boolean {
  return LANGUAGES.includes(lang);
}

function createSnippet(feature: string, name: string, lang: string) {
  if (!validateFeature(feature)) {
    console.error(`❌ Invalid feature: ${feature}`);
    console.log(`Valid features: ${FEATURES.join(', ')}`);
    process.exit(1);
  }

  if (!validateLanguage(lang)) {
    console.error(`❌ Invalid language: ${lang}`);
    console.log(`Valid languages: ${LANGUAGES.join(', ')}`);
    process.exit(1);
  }

  const extension = LANGUAGE_EXTENSIONS[lang];
  const boilerplate = LANGUAGE_BOILERPLATES[lang];

  const featureDir = path.join(SNIPPETS_DIR, feature, lang);
  const fileName = `${name}.${extension}`;
  const filePath = path.join(featureDir, fileName);

  // Create directory if it doesn't exist
  if (!fs.existsSync(featureDir)) {
    fs.mkdirSync(featureDir, { recursive: true });
    console.log(`📁 Created directory: ${path.relative(SNIPPETS_DIR, featureDir)}`);
  }

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(`❌ File already exists: ${path.relative(SNIPPETS_DIR, filePath)}`);
    process.exit(1);
  }

  // Write the boilerplate
  fs.writeFileSync(filePath, boilerplate);
  console.log(`✅ Created snippet: ${path.relative(SNIPPETS_DIR, filePath)}`);
  console.log(`\nYou can now reference this snippet in your docs with:`);
  console.log(`<SnippetCode src="fern/snippets/${feature}/${lang}/${fileName}" />`);
}

function showHelp() {
  console.log(`
Usage: pnpm snippet:new --feature=<feature> --name=<name> --lang=<language>

Options:
  --feature   The feature category (required)
              Valid values: ${FEATURES.join(', ')}
  
  --name      The name of the snippet file (required)
              Will be saved as <name>.<extension>
  
  --lang      The programming language (required)
              Valid values: ${LANGUAGES.join(', ')}
  
  --help      Show this help message

Examples:
  pnpm snippet:new --feature=providers --name=anthropic --lang=python
  pnpm snippet:new --feature=triggers --name=slack-events --lang=typescript
`);
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      feature: { type: 'string' },
      name: { type: 'string' },
      lang: { type: 'string' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const { feature, name, lang } = values;

  if (!feature || !name || !lang) {
    console.error('❌ Missing required arguments');
    showHelp();
    process.exit(1);
  }

  createSnippet(feature, name, lang);
}

main();