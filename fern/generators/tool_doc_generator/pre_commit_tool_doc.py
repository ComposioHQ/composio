#!/usr/bin/env python
"""
Minimal docs.yml updater for pre-commit hooks.

This script provides a minimal version that just sets the base layout 
for the tools section in docs.yml.
"""

import argparse
import logging
import sys
from pathlib import Path

import yaml

from generators.tool_doc_generator.base_docs import base_layout

logger = logging.getLogger(__name__)


def update_docs_yml_minimal(docs_yml_path: Path) -> None:
    """
    Minimal update of docs.yml file with just the base layout.
    
    Args:
        docs_yml_path: Path to the docs.yml file
    """
    logger.info("Updating docs.yml with minimal base layout")
    
    try:
        # Read the current docs.yml
        with open(docs_yml_path, "r") as f:
            docs_data = yaml.safe_load(f)
        
        # Find the "tools" tab section in the navigation structure
        for tab_section in docs_data.get("navigation", []):
            if tab_section.get("tab") == "tools":
                logger.info("Found tools tab section, setting base layout")
                tab_section["layout"] = base_layout
                break
        else:
            logger.warning("No tools tab section found in docs.yml")
            return
        
        # Write the updated YAML back to the file
        with open(docs_yml_path, "w") as f:
            yaml.dump(docs_data, f, default_flow_style=False, sort_keys=False)
        
        logger.info("✅ Updated docs.yml with base layout")
        
    except Exception as e:
        logger.error(f"Failed to update docs.yml: {e}")
        raise


def configure_logging(log_level: str = "info") -> None:
    """Configure logging settings."""
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        raise ValueError(f"Invalid log level: {log_level}")
    
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main() -> int:
    """Command-line entry point for minimal docs.yml update."""
    parser = argparse.ArgumentParser(
        description="Minimal docs.yml updater for pre-commit hooks"
    )
    parser.add_argument(
        "--docs-yml",
        type=str,
        help="Path to docs.yml file (default: ./docs.yml)",
        default="./docs.yml",
    )
    parser.add_argument(
        "--log-level",
        choices=["debug", "info", "warning", "error", "critical"],
        default="info",
        help="Set logging level",
    )
    
    args = parser.parse_args()
    
    try:
        # Configure logging
        configure_logging(args.log_level)
        
        # Convert path to absolute path
        docs_yml_path = Path(args.docs_yml).resolve()
        
        if not docs_yml_path.exists():
            logger.error(f"docs.yml file not found: {docs_yml_path}")
            return 1
        
        # Update docs.yml with minimal layout
        update_docs_yml_minimal(docs_yml_path)
        
        return 0
        
    except Exception as e:
        logger.error(f"Error updating docs.yml: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main()) 