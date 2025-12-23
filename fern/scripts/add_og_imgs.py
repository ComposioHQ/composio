#!/usr/bin/env python3
"""
Script to update image properties in MDX frontmatter for social media previews.

This script processes all MDX files in the fern/pages directory and adds or updates
the 'image' property in the frontmatter with a URL that generates social media
preview images based on the page title.

Usage:
    python scripts/update_mdx_images.py [--dry-run] [--verbose]

Options:
    --dry-run    Show what would be changed without making actual changes
    --verbose    Show detailed output for all processed files
"""

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote


def extract_title_from_frontmatter(frontmatter):
    """Extract the title from frontmatter string."""
    # Handle different title formats:
    # title: Simple Title
    # title: "Quoted Title"
    # title: 'Single Quoted Title'
    title_patterns = [
        r"^title:\s*[\"']([^\"']+)[\"']\s*$",  # Quoted titles
        r"^title:\s*([^#\n]+?)(?:\s*#.*)?$",  # Unquoted titles (with optional comments)
    ]

    for pattern in title_patterns:
        match = re.search(pattern, frontmatter, re.MULTILINE)
        if match:
            return match.group(1).strip()

    return None


def has_frontmatter(content):
    """Check if content has valid frontmatter."""
    return content.startswith("---") and content.count("---") >= 2


def update_mdx_image(file_path, dry_run=False, verbose=False):
    """
    Update the image property in MDX frontmatter based on the title.

    Args:
        file_path: Path to the MDX file
        dry_run: If True, don't actually modify files
        verbose: If True, show detailed output

    Returns:
        dict: Result information with keys 'updated', 'message', 'title'
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        return {"updated": False, "message": f"Error reading file: {e}", "title": None}

    # Check if file has frontmatter
    if not has_frontmatter(content):
        return {"updated": False, "message": "No frontmatter found", "title": None}

    # Split frontmatter and content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {"updated": False, "message": "Invalid frontmatter format", "title": None}

    frontmatter = parts[1]
    body = parts[2]

    # Extract title from frontmatter
    title = extract_title_from_frontmatter(frontmatter)
    if not title:
        return {"updated": False, "message": "No title found in frontmatter", "title": None}

    # Create the image URL
    encoded_title = quote(title)
    image_url = f'"https://og.composio.dev/api/og?title={encoded_title}"'

    # Check if image property already exists
    image_pattern = r"^image:\s*.*$"
    image_match = re.search(image_pattern, frontmatter, re.MULTILINE)

    if image_match:
        return {
            "updated": False,
            "message": "Image property already present, skipping",
            "title": title,
        }
    else:
        # Add image property after title
        title_pattern = r"^title:\s*.*$"
        title_match = re.search(title_pattern, frontmatter, re.MULTILINE)

        if not title_match:
            return {
                "updated": False,
                "message": "Could not find title line to insert image after",
                "title": title,
            }

        title_line = title_match.group(0)
        new_image_line = f"image: {image_url}   # image for socials"
        new_frontmatter = frontmatter.replace(title_line, f"{title_line}\n{new_image_line}")
        action = "Added new"

    # Don't write if dry run
    if dry_run:
        return {"updated": True, "message": f"{action} image property (DRY RUN)", "title": title}

    # Reconstruct the file content
    new_content = f"---{new_frontmatter}---{body}"

    # Write back to file
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        return {"updated": True, "message": f"{action} image property", "title": title}
    except Exception as e:
        return {"updated": False, "message": f"Error writing file: {e}", "title": title}


def main():
    """Process all MDX files in fern/pages directory."""
    parser = argparse.ArgumentParser(
        description="Update image properties in MDX frontmatter for social media previews"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without making actual changes",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Show detailed output for all processed files"
    )

    args = parser.parse_args()

    # Determine the pages directory relative to script location
    script_dir = Path(__file__).parent
    pages_dir = script_dir.parent / "pages"

    if not pages_dir.exists():
        print(f"Error: Pages directory not found at {pages_dir}")
        print("Make sure to run this script from the fern directory")
        sys.exit(1)

    # Find all MDX files
    mdx_files = list(pages_dir.rglob("*.mdx"))

    if not mdx_files:
        print("No MDX files found in pages directory")
        return

    print(f"Found {len(mdx_files)} MDX files")
    if args.dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()

    # Process files
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for mdx_file in sorted(mdx_files):
        rel_path = mdx_file.relative_to(pages_dir)

        try:
            result = update_mdx_image(mdx_file, dry_run=args.dry_run, verbose=args.verbose)

            if result["updated"]:
                updated_count += 1
                status = "✅" if not args.dry_run else "🔄"
                print(f"{status} {rel_path}")
                if args.verbose or args.dry_run:
                    print(f"   Title: {result['title']}")
                    print(f"   Action: {result['message']}")
            else:
                skipped_count += 1
                if args.verbose:
                    print(f"⏭️  {rel_path}")
                    print(f"   Reason: {result['message']}")
                    if result["title"]:
                        print(f"   Title: {result['title']}")

        except Exception as e:
            error_count += 1
            print(f"❌ {rel_path}")
            print(f"   Error: {e}")

    # Summary
    print(f"\n📊 Summary:")
    print(f"   Total files: {len(mdx_files)}")
    print(f"   Updated: {updated_count}")
    print(f"   Skipped: {skipped_count}")
    if error_count > 0:
        print(f"   Errors: {error_count}")

    if args.dry_run and updated_count > 0:
        print(f"\n💡 Run without --dry-run to apply {updated_count} changes")


if __name__ == "__main__":
    main()
