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

// Parse tool MDX files to extract toolkit information
function parseToolkitMdx(toolMdxPath: string): ToolkitInfo | null {
  try {
    const fullPath = path.join(TOOLKITS_DIR, toolMdxPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Tool file not found: ${fullPath}`);
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn(`⚠️  No frontmatter found in: ${toolMdxPath}`);
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
    if (!titleMatch) {
      console.warn(`⚠️  No title found in: ${toolMdxPath}`);
      return null;
    }

    // Extract SLUG from content
    const slugMatch = content.match(/\*\*SLUG\*\*:\s*`([^`]+)`/);
    if (!slugMatch) {
      // Not a toolkit page, skip
      return null;
    }

    // Extract description
    const descriptionMatch = content.match(/### Description\s*\n(.+?)(?:\n|$)/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    // Extract tool names from Accordion titles
    const toolNames: string[] = [];
    const accordionMatches = content.matchAll(/<Accordion title="([^"]+)">/g);

    for (const match of accordionMatches) {
      const toolName = match[1];
      // Only include tools that start with the toolkit prefix
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
    console.warn(`⚠️  Error parsing tool file ${toolMdxPath}:`, error);
    return null;
  }
}

// Scan toolkits directory and build tools data
function buildToolsData(): ToolsData {
  const toolsData: ToolsData = { toolkitNames: [] };

  if (!fs.existsSync(TOOLKITS_DIR)) {
    console.warn(`⚠️  Toolkits directory not found: ${TOOLKITS_DIR}`);
    return toolsData;
  }

  // Read all MDX files in toolkits directory
  const files = fs.readdirSync(TOOLKITS_DIR);
  const mdxFiles = files.filter(file => file.endsWith('.mdx'));

  console.log(`📂 Found ${mdxFiles.length} MDX files in toolkits directory`);

  for (const file of mdxFiles) {
    const toolkitInfo = parseToolkitMdx(file);
    if (toolkitInfo) {
      toolsData.toolkitNames.push(toolkitInfo.slug);
      toolsData[toolkitInfo.slug] = toolkitInfo;
      console.log(`  ✓ ${toolkitInfo.slug}: ${toolkitInfo.tools.length} tools`);
    }
  }

  // Sort toolkit names alphabetically
  toolsData.toolkitNames.sort();

  return toolsData;
}

// Main function
async function main(): Promise<void> {
  console.log('🔨 Building tools.json...');

  try {
    // Build tools data
    const toolsData = buildToolsData();
    
    console.log(`\n📊 Summary:`);
    console.log(`  - Total toolkits: ${toolsData.toolkitNames.length}`);
    
    let totalTools = 0;
    for (const name of toolsData.toolkitNames) {
      const toolkit = toolsData[name] as ToolkitInfo;
      totalTools += toolkit.tools.length;
    }
    console.log(`  - Total tools: ${totalTools}`);

    // Write tools.json
    const toolsJsonContent = JSON.stringify(toolsData, null, 2);
    fs.writeFileSync(TOOLS_JSON_PATH, toolsJsonContent);
    
    console.log(`\n✅ Generated tools.json at ${TOOLS_JSON_PATH}`);
  } catch (error) {
    console.error('❌ Error building tools.json:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});