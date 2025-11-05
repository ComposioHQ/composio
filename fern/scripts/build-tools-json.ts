#!/usr/bin/env bun
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';

const FERN_DIR = path.join(import.meta.dir, '..');
const TOOLKITS_DIR = path.join(FERN_DIR, 'toolkits');
const TOOLS_JSON_PATH = path.join(
  FERN_DIR,
  'llms-txt-worker',
  'public',
  'robots-only',
  'tools.json'
);

interface ToolkitInfo {
  slug: string;
  description: string;
  tools: string[];
}

interface ToolsData {
  toolkitNames: string[];
  [key: string]: string[] | ToolkitInfo;
}

function parseToolkitMdx(toolMdxPath: string): ToolkitInfo | null {
  try {
    const fullPath = path.join(TOOLKITS_DIR, toolMdxPath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
    if (!titleMatch) return null;

    const slugMatch = content.match(/\*\*SLUG\*\*:\s*`([^`]+)`/);
    if (!slugMatch) return null;

    const descriptionMatch = content.match(/### Description\s*\n(.+?)(?:\n|$)/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';
    
    const toolNames: string[] = [];
    const accordionMatches = content.matchAll(/<Accordion title="([^"]+)">/g);

    for (const match of accordionMatches) {
      const toolName = match[1];
      if (toolName.startsWith(slugMatch[1] + '_')) {
        toolNames.push(toolName);
      }
    }

    return {
      slug: slugMatch[1],
      description,
      tools: toolNames,
    };
  } catch (error) {
    console.warn(`Error parsing ${toolMdxPath}:`, error);
    return null;
  }
}

function buildToolsData(): ToolsData {
  const toolsData: ToolsData = { toolkitNames: [] };

  if (!fs.existsSync(TOOLKITS_DIR)) {
    console.error(`Toolkits directory not found: ${TOOLKITS_DIR}`);
    return toolsData;
  }

  const files = fs.readdirSync(TOOLKITS_DIR);
  const mdxFiles = files.filter(file => file.endsWith('.mdx'));
  console.log(`Found ${mdxFiles.length} MDX files`);

  for (const file of mdxFiles) {
    const toolkitInfo = parseToolkitMdx(file);
    if (toolkitInfo) {
      toolsData.toolkitNames.push(toolkitInfo.slug);
      toolsData[toolkitInfo.slug] = toolkitInfo;
      console.log(`  ${toolkitInfo.slug}: ${toolkitInfo.tools.length} tools`);
    }
  }

  toolsData.toolkitNames.sort();
  return toolsData;
}

function main() {
  console.log('Building tools.json...');
  try {
    const toolsData = buildToolsData();
    
    console.log(`\nSummary:`);
    console.log(`  Total toolkits: ${toolsData.toolkitNames.length}`);
    
    let totalTools = 0;
    for (const name of toolsData.toolkitNames) {
      const toolkit = toolsData[name] as ToolkitInfo;
      totalTools += toolkit.tools.length;
    }
    console.log(`  Total tools: ${totalTools}`);

    fs.writeFileSync(TOOLS_JSON_PATH, JSON.stringify(toolsData, null, 2));
    console.log(`\nGenerated ${TOOLS_JSON_PATH}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();