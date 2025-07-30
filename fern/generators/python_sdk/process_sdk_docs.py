#!/usr/bin/env python
"""
Process SDK documentation files with autodoc markers.

This is a simplified version that doesn't require toctree validation.
"""
import os
import re
import importlib
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple
from tqdm import tqdm

from .autodoc_core.autodoc import autodoc, resolve_links_in_text
from .markdown_formatter import convert_xml_to_markdown

# Pattern to find [[autodoc]] markers
_re_autodoc = re.compile(r"^\s*\[\[autodoc\]\]\s+(\S+)\s*$")

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def process_autodoc_file(
    file_path: Path,
    package,
    page_info: Dict[str, str],
    version_tag_suffix: str = "python/"
) -> Tuple[str, Dict[str, str]]:
    """
    Process a single file containing autodoc markers.
    
    Args:
        file_path: Path to the markdown file
        package: The Python package to document
        page_info: Information about the documentation page
        version_tag_suffix: Suffix for version tags in links
        
    Returns:
        Tuple of (processed content, anchor mapping)
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')
    
    new_lines = []
    idx = 0
    anchors = {}
    
    while idx < len(lines):
        if _re_autodoc.search(lines[idx]) is not None:
            object_name = _re_autodoc.search(lines[idx]).groups()[0]
            logger.info(f"Processing autodoc: {object_name}")
            
            try:
                result = autodoc(
                    object_name, 
                    package,
                    return_anchors=True,
                    page_info=page_info,
                    version_tag_suffix=version_tag_suffix
                )
                
                doc, new_anchors, errors = result
                doc = convert_xml_to_markdown(doc)
                
                # Collect anchors
                page_name = file_path.stem
                for anchor in new_anchors:
                    if isinstance(anchor, tuple):
                        for a in anchor:
                            anchors[a] = page_name
                    else:
                        anchors[anchor] = page_name
                
                if errors:
                    logger.warning(f"Autodoc warnings for {object_name}: {errors}")
                
                new_lines.append(doc.strip())
                
            except Exception as e:
                logger.error(f"Error processing {object_name}: {e}")
                new_lines.append(lines[idx])
        else:
            new_lines.append(lines[idx])
        
        idx += 1
    
    content = '\n'.join(new_lines)
    return content, anchors


def build_sdk_docs(
    source_dir: Path,
    output_dir: Path,
    package_name: str,
    version: str = "main",
    clean: bool = False
):
    """
    Build SDK documentation from markdown files with autodoc markers.
    
    Args:
        source_dir: Directory containing source markdown files
        output_dir: Directory where processed files will be written
        package_name: Name of the Python package to document
        version: Version of the documentation
        clean: Whether to clean the output directory before building
    """
    source_dir = Path(source_dir)
    output_dir = Path(output_dir)
    
    if not source_dir.exists():
        raise ValueError(f"Source directory {source_dir} does not exist")
    
    # Clean output directory if requested
    if clean and output_dir.exists():
        import shutil
        shutil.rmtree(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Import the package
    try:
        package = importlib.import_module(package_name)
    except ImportError as e:
        raise ImportError(f"Failed to import package {package_name}: {e}")
    
    # Page info for documentation
    page_info = {
        "version": version,
        "version_tag": version,
        "language": "en",
        "package_name": package_name,
    }
    
    # Phase 1: Process all files and collect anchors
    logger.info("Phase 1: Processing autodoc markers and collecting anchors")
    all_anchors = {}
    file_contents = {}
    
    markdown_files = list(source_dir.glob("**/*.md")) + list(source_dir.glob("**/*.mdx"))
    
    for file_path in tqdm(markdown_files, desc="Processing files"):
        if file_path.is_file():
            logger.info(f"Processing: {file_path}")
            content, anchors = process_autodoc_file(file_path, package, page_info)
            
            # Store content and anchors
            relative_path = file_path.relative_to(source_dir)
            file_contents[relative_path] = content
            all_anchors.update(anchors)
    
    logger.info(f"Collected {len(all_anchors)} anchors")
    
    # Phase 2: Resolve cross-references
    logger.info("Phase 2: Resolving cross-references")
    
    for relative_path, content in tqdm(file_contents.items(), desc="Resolving links"):
        # Resolve cross-references
        resolved_content = resolve_links_in_text(content, package, all_anchors, page_info)
        
        # Write output file
        output_path = output_dir / relative_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(resolved_content)
    
    logger.info(f"Documentation built successfully in {output_dir}")
    return all_anchors