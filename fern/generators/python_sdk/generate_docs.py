#!/usr/bin/env python
"""
Generate SDK documentation for Composio Python SDK.

Usage:
    uv run python generators/python-sdk/generate_docs.py
"""
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Add local python package directory to path (for local composio package)
workspace_root = Path(__file__).parent.parent.parent.parent
python_dir = workspace_root / "python"
if python_dir.exists():
    sys.path.insert(0, str(python_dir))
    print(f"Using local composio package from: {python_dir}")
else:
    print(f"Warning: Local python directory not found at {python_dir}")

from generators.python_sdk.process_sdk_docs import build_sdk_docs


def main():
    """Generate SDK documentation."""
    fern_dir = Path(__file__).parent.parent.parent
    source_dir = fern_dir / "generators" / "python_sdk" / "templates"
    output_dir = fern_dir / "pages" / "dist" / "sdk" / "python"
    
    print("Generating Composio Python SDK documentation...")
    print(f"Source: {source_dir}")
    print(f"Output: {output_dir}")
    
    try:
        anchors = build_sdk_docs(
            source_dir=source_dir,
            output_dir=output_dir,
            package_name="composio",
            version="next",
            clean=False  # Don't clean to preserve other files
        )
        
        print(f"\n✓ Successfully generated documentation with {len(anchors)} anchors")
        print(f"✓ Output written to: {output_dir}")
        
    except Exception as e:
        print(f"\n✗ Error generating documentation: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()