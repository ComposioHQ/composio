#!/usr/bin/env python3
"""
Script to comment/uncomment tool docs in docs.yml, leaving only the introduction.
Uses ruamel.yaml to properly parse and modify the YAML structure.
"""

import argparse
from pathlib import Path
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
import io


def process_tool_docs(file_path: Path, action: str) -> None:
    """
    Process the docs.yml file to comment or uncomment tool docs.
    
    Args:
        file_path: Path to the docs.yml file
        action: Either 'comment' or 'uncomment'
    """
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096  # Prevent line wrapping
    yaml.indent(mapping=2, sequence=2, offset=0)
    
    # Read the file content
    with open(file_path, 'r') as f:
        content = f.read()
    
    if action == 'uncomment':
        # First, uncomment any commented lines in the toolkits section
        lines = content.split('\n')
        new_lines = []
        in_tools_section = False
        
        for i, line in enumerate(lines):
            # Check if we're entering the toolkits tab
            if '- tab: toolkits' in line:
                in_tools_section = True
            # Check if we're leaving the toolkits tab
            elif in_tools_section and line.strip().startswith('- tab:'):
                in_tools_section = False
            
            # Uncomment lines in toolkits section
            if in_tools_section and line.strip().startswith('#') and ('- page:' in line or 'path:' in line):
                # Remove comment while preserving indentation
                uncommented = line.replace('# ', '', 1) if '# ' in line else line.replace('#', '', 1)
                new_lines.append(uncommented)
            else:
                new_lines.append(line)
        
        content = '\n'.join(new_lines)
    
    # Parse the YAML
    data = yaml.load(content)
    
    # Find the navigation section
    if 'navigation' not in data:
        print("Error: No navigation section found in docs.yml")
        return
    
    # Find the toolkits tab
    tools_tab = None
    for tab in data['navigation']:
        if isinstance(tab, CommentedMap) and tab.get('tab') == 'toolkits':
            tools_tab = tab
            break
    
    if not tools_tab:
        print("Error: No toolkits tab found in navigation")
        return
    
    # Find the toolkits section within the toolkits tab
    if 'layout' not in tools_tab:
        print("Error: No layout found in toolkits tab")
        return
    
    tools_section = None
    for section in tools_tab['layout']:
        if isinstance(section, CommentedMap) and section.get('section') == 'Toolkits':
            tools_section = section
            break
    
    if not tools_section or 'contents' not in tools_section:
        print("Error: No contents found in Toolkits section")
        return
    
    if action == 'comment':
        # Write the data to a string first
        stream = io.StringIO()
        yaml.dump(data, stream)
        content = stream.getvalue()
        
        # Now manually comment out toolkits after the 1st one (introduction)
        lines = content.split('\n')
        new_lines = []
        in_tools_section = False
        tool_count = 0
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            # Check if we're entering the toolkits section
            if '- section: Toolkits' in line and 'toolkits' in '\n'.join(lines[max(0, i-10):i]):
                in_tools_section = True
                new_lines.append(line)
                i += 1
                continue
            
            # Check if we're leaving the tools section
            if in_tools_section and line.strip().startswith('- tab:'):
                in_tools_section = False
                tool_count = 0
            
            # Count and process tool entries
            if in_tools_section and '- page:' in line and line.strip().startswith('- page:'):
                tool_count += 1
                if tool_count > 1:  # Skip only the introduction
                    # Comment out this line and the next one (path line)
                    indent = len(line) - len(line.lstrip())
                    new_lines.append(' ' * indent + '# ' + line.lstrip())
                    # Also comment the next line if it's a path line
                    if i + 1 < len(lines) and 'path:' in lines[i + 1]:
                        i += 1
                        line = lines[i]
                        indent = len(line) - len(line.lstrip())
                        new_lines.append(' ' * indent + '# ' + line.lstrip())
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
            
            i += 1
        
        # Write the commented version
        with open(file_path, 'w') as f:
            f.write('\n'.join(new_lines))
    else:
        # For uncomment, just write the parsed data back
        with open(file_path, 'w') as f:
            yaml.dump(data, f)
    
    print(f"Successfully {action}ed tool docs in {file_path}")
    if action == 'comment':
        print("Left uncommented: Introduction only")
    else:
        print("All tool docs are now uncommented")


def main():
    parser = argparse.ArgumentParser(
        description='Comment or uncomment tool docs in docs.yml using ruamel.yaml'
    )
    parser.add_argument(
        'action',
        choices=['comment', 'uncomment'],
        help='Action to perform: comment or uncomment tool docs'
    )
    parser.add_argument(
        '--file',
        type=Path,
        default=Path(__file__).parent.parent / 'docs.yml',
        help='Path to docs.yml file (default: ../docs.yml relative to script)'
    )
    
    args = parser.parse_args()
    
    if not args.file.exists():
        print(f"Error: File {args.file} does not exist")
        return 1
    
    try:
        process_tool_docs(args.file, args.action)
        return 0
    except Exception as e:
        print(f"Error processing file: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
