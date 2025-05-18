#!/usr/bin/env bun

import { compile } from '@mdx-js/mdx';
import fs from 'fs';
import path from 'path';

// Function to find all MDX files in a directory recursively
function findMdxFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findMdxFiles(filePath, fileList);
    } else if (file.endsWith('.mdx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Check a single MDX file for any errors
async function checkMdxFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    await compile(content, {
      filename: filePath
    });
    
    return null; // No errors found
  } catch (error) {
    // Return all errors with their details
    return {
      file: filePath,
      message: error.message,
      line: error.line,
      column: error.column,
      name: error.name,
      stack: error.stack
    };
  }
}

// Main function
async function main() {
  const toolsDir = '/Users/sid/main-quests/composio/composio/fern/tools';
  console.log(`Scanning directory: ${toolsDir}`);
  
  const mdxFiles = findMdxFiles(toolsDir);
  console.log(`Found ${mdxFiles.length} MDX files`);
  
  let mdxIssues = [];
  
  // Process all files in parallel with Promise.all
  const results = await Promise.all(
    mdxFiles.map(file => checkMdxFile(file))
  );
  
  // Filter out nulls and collect issues
  mdxIssues = results.filter(result => result !== null);
  
  // Display the issues
  if (mdxIssues.length > 0) {
    console.log('\nFound MDX errors in the following files:');
    
    mdxIssues.forEach(issue => {
      console.log(`\n[${issue.file}] at line ${issue.line}, column ${issue.column}:`);
      console.log(`Error type: ${issue.name}`);
      console.log(`Message: ${issue.message}`);
      
      // Show the line in context
      try {
        const content = fs.readFileSync(issue.file, 'utf8');
        const lines = content.split('\n');
        
        // Show up to 3 lines before and after for context
        const startLine = Math.max(0, (issue.line || 1) - 3);
        const endLine = Math.min(lines.length, (issue.line || 1) + 3);
        
        console.log('\nContext:');
        for (let i = startLine; i < endLine; i++) {
          const lineNumber = i + 1;
          const marker = lineNumber === issue.line ? '>' : ' ';
          console.log(`${marker} ${lineNumber}: ${lines[i]}`);
        }
        
        // Show stack trace for debugging
        if (issue.stack) {
          console.log('\nStack trace:');
          console.log(issue.stack);
        }
      } catch (err) {
        console.log('  (Could not show context)');
      }
    });
    
    console.log(`\nSummary: Found errors in ${mdxIssues.length} files`);
    process.exit(1); // Exit with error code if issues found
  } else {
    console.log('\nNo MDX errors found!');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});