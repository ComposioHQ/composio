#!/usr/bin/env python3
"""
Script to compress all docs into a single .mdx file.
Only includes files that are defined in docs.yml.
"""

import os
import yaml
from pathlib import Path

# Base directory where docs are located
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Docs.yml file
DOCS_YML = os.path.join(BASE_DIR, "docs.yml")

# Output file
OUTPUT_FILE = os.path.join(BASE_DIR, "compressed-docs.mdx")

def extract_paths_from_section(section):
    """Extract .mdx file paths from a section in docs.yml."""
    paths = []
    
    # Check if section has contents
    if 'contents' not in section:
        return paths
    
    # Process each item in contents
    for item in section['contents']:
        # Check if the item is a page with a path
        if 'page' in item and 'path' in item:
            paths.append(item['path'])
        # If it's a nested section, process recursively
        elif 'contents' in item:
            paths.extend(extract_paths_from_section(item))
    
    return paths

def main():
    """Main function to compress docs."""
    print(f"Base directory: {BASE_DIR}")
    
    # Load docs.yml
    try:
        with open(DOCS_YML, 'r', encoding='utf-8') as f:
            docs_config = yaml.safe_load(f)
    except Exception as e:
        print(f"Error loading docs.yml: {e}")
        return
    
    # Extract all file paths from docs.yml
    all_paths = []
    
    # Process each tab in navigation
    if 'navigation' in docs_config:
        for tab in docs_config['navigation']:
            if 'layout' in tab:
                for section in tab['layout']:
                    all_paths.extend(extract_paths_from_section(section))
    
    # Convert paths to absolute paths
    all_files = [os.path.join(BASE_DIR, path) for path in all_paths]
    print('\n'.join(all_files))
    print(f"Found {len(all_files)} .mdx files defined in docs.yml")
    
    # Create the compressed file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        for file_path in all_files:
            # Get relative path for the separator
            rel_path = os.path.relpath(file_path, BASE_DIR)
            
            # Write separator
            outfile.write(f"```mdx {rel_path}\n\n")
            
            # Read and write file content
            try:
                with open(file_path, 'r', encoding='utf-8') as infile:
                    content = infile.read()
                    outfile.write(content)
                    
                # Add newlines after content and end the code block
                outfile.write("\n\n```\n\n")
            except Exception as e:
                print(f"Error processing {file_path}: {e}")
    
    print(f"Compressed docs created at: {OUTPUT_FILE}")
    print(f"Included {len(all_files)} files from docs.yml")

if __name__ == "__main__":
    main()