#!/usr/bin/env python
"""
API Documentation generator for Composio SDK.

Usage:
    python generate_api_docs.py [--source PATH_TO_COMPOSIO_REPO] [--output PATH_TO_DOCUMENTATION_OUTPUT]

Defaults:
    PATH_TO_COMPOSIO_REPO: ./composio
    PATH_TO_DOCUMENTATION_OUTPUT: ./fern/sdk
"""

import argparse
import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from api_doc_generator.main import main


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate API documentation for Composio SDK."
    )
    parser.add_argument(
        "--source", "-s", 
        type=str,
        help="Path to the Composio repository (default: ./composio/composio)"
    )
    parser.add_argument(
        "--output", "-o", 
        type=str,
        help="Path for documentation output (default: ./fern/sdk)"
    )
    parser.add_argument(
        "--version", "-v", 
        action="version", 
        version="Composio API Doc Generator v1.0.0"
    )
    
    args = parser.parse_args()
    
    path = Path(args.source).resolve() if args.source else None
    output = Path(args.output).resolve() if args.output else None
    
    main(
        path=path,
        output=output,
    ) 