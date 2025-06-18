#!/usr/bin/env python
"""
Test the SDK documentation generator
"""
import sys
from pathlib import Path
import tempfile
import shutil

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from process_sdk_docs import build_sdk_docs


def test_generator():
    """Test the documentation generator with a simple example."""
    
    # Use the actual fern directory structure
    fern_dir = Path(__file__).parent.parent.parent
    source_dir = fern_dir / "generators" / "python-sdk" / "templates"
    output_dir = fern_dir / "docs" / "sdk" / "python"
    
    # Create source directory if it doesn't exist
    source_dir.mkdir(parents=True, exist_ok=True)
        
    # Create a test markdown file
    test_file = source_dir / "sdk-reference.md"
    if not test_file.exists():
        test_file.write_text("""# Composio SDK Reference

## Main Class

[[autodoc]] composio.Composio

## Tools

[[autodoc]] composio.core.models.Tools

## Cross References

The [`Composio`] class is the main entry point.
""")
    
    print(f"Created test file: {test_file}")
    print("Running documentation generator...")
    
    try:
        # Run the generator
        anchors = build_sdk_docs(
            source_dir=source_dir,
            output_dir=output_dir,
            package_name="composio",
            version="test",
            repo_owner="composio"
        )
        
        print(f"\nGenerated {len(anchors)} anchors")
        print("\nOutput files:")
        for file in output_dir.rglob("*"):
            if file.is_file():
                print(f"  - {file.relative_to(output_dir)}")
                print(f"    Size: {file.stat().st_size} bytes")
        
        # Read and display the output
        output_file = output_dir / "sdk-reference.md"
        if output_file.exists():
            print("\nGenerated content preview:")
            print("-" * 50)
            content = output_file.read_text()
            print(content[:500] + "..." if len(content) > 500 else content)
            print("-" * 50)
        
        print("\nTest completed successfully!")
        
    except Exception as e:
        print(f"\nError during test: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_generator()