"""
API Documentation generator for Composio SDK.

This module contains the main functions for generating API documentation.
"""

import os
import sys
import json
import shutil
from pathlib import Path
import typing as t

from .handlers import handle_file, handle_dir


# List of modules to include in documentation
INCLUDE = (
    "client",
    "storage",
    "tools",
    "utils",
    "constants.py",
    "exceptions.py",
)


def main(
    path: t.Optional[Path] = None,
    output: t.Optional[Path] = None,
) -> None:
    """Run documentation generator."""
    try:
        # Setup output directory - default is now fern/sdk
        output = output or Path.cwd() / "fern" / "sdk"
        if output.exists():
            shutil.rmtree(output)
        output.mkdir(parents=True, exist_ok=True)
        print(f"Output directory: {output}")

        # Set path and change directory
        path = path or Path.cwd() / "composio" / "composio"
        if not path.exists():
            print(f"Path {path} does not exist!")
            return
            
        print(f"Using source directory: {path}")
        
        # Store original directory to return to it later
        original_dir = os.getcwd()
        
        try:
            os.chdir(path.parent)
            print(f"Changed directory to: {os.getcwd()}")
            
            collection = {
                "group": "Reference",
                "pages": [],
            }
            
            # First check for Python files in the root directory
            for file_path in path.glob("*.py"):
                print(f"Processing root file: {file_path}")
                try:
                    page = handle_file(file=file_path, output=output)
                    if page is not None:
                        collection["pages"].append(page)
                except Exception as e:
                    print(f"Error processing file {file_path}: {e}")
            
            # Then process the standard includes
            for include in INCLUDE:
                include_path = path / include
                print(f"Processing include: {include_path}")
                if not include_path.exists():
                    print(f"Included path {include_path} does not exist, skipping...")
                    continue
                    
                try:
                    if include_path.is_file():
                        page = handle_file(file=include_path, output=output)
                    else:
                        page = handle_dir(directory=include_path, output=output)
                        
                    if page is not None:
                        collection["pages"].append(page)
                except Exception as e:
                    print(f"Error processing include {include}: {e}")
                    
            # Filter out None values from pages
            collection["pages"] = [p for p in collection["pages"] if p is not None]
            
            # Output the collection for mint.json
            print(f"Documentation generated in: {output}")
            print(f"Total pages generated: {len(collection['pages'])}")
            print(f"Add following config to `mint.json`\n{json.dumps(collection, indent=2)}")
            
            # Check if any files were created
            generated_files = list(output.glob("**/*.mdx"))
            print(f"Total MDX files generated: {len(generated_files)}")
            if generated_files:
                print(f"Sample files: {generated_files[:5]}")
            
        finally:
            # Return to original directory
            os.chdir(original_dir)
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"An error occurred in main: {e}")