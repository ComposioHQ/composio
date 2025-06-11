#!/usr/bin/env python
"""
Tool Documentation Generator for Composio.

This script automates the generation of MDX documentation for Composio tools.
"""

import argparse
import concurrent.futures
import html
import logging
import os
import re
import sys
import threading
import traceback
import typing as t
from dataclasses import dataclass, field
from pathlib import Path

try:
    from ruamel.yaml import YAML

    USE_RUAMEL = True
except ImportError:
    # Fallback to standard yaml if ruamel.yaml is not available
    import yaml as yaml_module  # Renamed to avoid unused import warning

    USE_RUAMEL = False
    logger = logging.getLogger(__name__)
    logger.warning(
        "ruamel.yaml not found, falling back to standard yaml. Install with: uv pip install ruamel.yaml"
    )

# Import MDX linting functionality
from composio.client.collections import Actions, AppAuthScheme, ActionModel
from composio_openai import App, ComposioToolSet
from dotenv import load_dotenv
from inflection import titleize

# Import from the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdx_formatter import MDX


# Configure logging
logger = logging.getLogger(__name__)


def sanitize_html(text: str) -> str:
    """
    Sanitize HTML content by removing HTML tags and decoding HTML entities.
    Also escapes problematic characters that might break MDX parsing.

    Args:
        text: The text to sanitize

    Returns:
        Sanitized text safe for MDX
    """
    if not text:
        return ""

    # Convert text to string if it's not already
    text = str(text)

    # Remove HTML tags
    text = re.sub(r"<.*?>", "", text)

    # Handle comparison operators that break MDX
    # These are the specific patterns we saw in the error output
    text = re.sub(r"<(\d+)", r"less than \1", text)  # <4mb -> less than 4mb
    text = re.sub(r">(\d+)", r"greater than \1", text)  # >10 -> greater than 10
    text = re.sub(r"<=(\d+)", r"less than or equal to \1", text)
    text = re.sub(r">=(\d+)", r"greater than or equal to \1", text)

    # For standalone < and > characters, replace with safer alternatives
    text = re.sub(r"(?<!\w)<(?!\w)", "&lt;", text)
    text = re.sub(r"(?<!\w)>(?!\w)", "&gt;", text)

    # Replace quote types that can break MDX

    # Escape pipe characters that can break tables
    text = text.replace("|", "\\|")
    text = re.sub(r"\{([^}]*)\s+([^}]*)\}", r"{\1_\2}", text)

    # Handle JSON examples with quotes
    if "{" in text and "}" in text:
        # Replace single and double quotes in JSON with backticks
        text = re.sub(
            r"(\{[^{}]*\})", lambda m: m.group(0).replace("'", "`").replace('"', "`"), text
        )

        # If we still have curly braces, wrap them in code tags
        text = re.sub(r"(\{[^{}]+\})", r"`\1`", text)

    # Handle special characters that might trigger MDX parsing
    text = text.replace("$", "\\$")
    text = text.replace("%", "\\%")

    # Some special HTML entities need to be preserved during unescaping
    text = html.unescape(text.replace("&lt;", "_LT_").replace("&gt;", "_GT_"))
    text = text.replace("_LT_", "&lt;").replace("_GT_", "&gt;")

    # Remove any trailing/leading whitespace
    text = text.strip()

    return text


@dataclass
class DocumentContent:
    """Document content builder for Composio tool documentation."""

    _blocks: list[str] = field(default_factory=list)

    def add_frontmatter(self, app_name: str) -> "DocumentContent":
        """
        Add frontmatter section to the document.

        Args:
            app_name: The name of the application

        Returns:
            Self reference for method chaining
        """
        self._blocks.append(MDX.as_frontmatter(app_name))
        return self

    def add_overview_section(
        self,
        app_name: str,
        app_id: str,
        description: str,
        auth_schemes: t.Optional[t.List[AppAuthScheme]] = None,
        tags: t.Optional[list] = None,
    ) -> "DocumentContent":
        """
        Add overview section to the document.

        Args:
            app_name: The name of the application
            app_id: The application ID
            description: Application description
            auth_schemes: Authentication schemes for the app
            tags: Tags supported by the app

        Returns:
            Self reference for method chaining
        """
        # Main overview header
        self._blocks.extend(
            [
                "## Overview",
                f"### Enum\n`{app_id.upper()}`",
                f"### Description\n{sanitize_html(description)}",
            ]
        )

        # Authentication schemes if present
        if auth_schemes:
            self._blocks.append("### Authentication Details")
            for scheme in auth_schemes:
                field_block = []
                for field in scheme.fields:
                    # Apply sanitization to auth field properties too
                    safe_name = field.name.replace('"', '\\"')
                    safe_type = str(field.type).replace('"', '\\"')
                    safe_default = str(field.default).replace('"', '\\"') if field.default else ""

                    field_block.append(
                        MDX.as_param(
                            name=safe_name,
                            required=field.required,
                            typ=safe_type,
                            default=safe_default,
                        )
                    )
                self._blocks.append(
                    MDX.as_accordion(title=scheme.auth_mode, content="\n".join(field_block))
                )

        # Tags if present
        if tags:
            self._blocks.append("### Tags Supported")
            for tag in tags:
                self._blocks.append(f"- `{tag}`")

        return self

    def add_actions(self, actions: t.List[ActionModel]) -> "DocumentContent":
        """
        Add actions section to the document.

        Args:
            actions: List of action models to document

        Returns:
            Self reference for method chaining
        """
        # If this is the first action, add the Actions header
        if not any("## Actions" in block for block in self._blocks):
            self._blocks.append("## Actions")

        all_action_content = []

        for action in actions:
            action_content = []
            params = action.parameters
            response = action.response

            # Description with encoding fixes and sanitization
            action_content.append(
                # sanitize_html(action.description.replace("<<", "(").replace(">>", ")"))
                MDX.as_code_block(action.description, "text")
            )

            # Process parameters with enhanced sanitization to avoid MDX parsing issues
            action_params = []
            for k, v in params.properties.items():
                # Get the basic sanitized description
                doc = sanitize_html(v.get("description", ""))
                param_content = MDX.as_param(
                    name=k,
                    typ=str(v.get("type", "")),
                    doc=doc,
                    default=v.get("default", ""),
                    required=k in params.required if params.required else False,
                )
                action_params.append(param_content)

            # Process responses with the same enhanced sanitization
            action_responses = []
            for k, v in response.properties.items():
                # Get the basic sanitized description
                doc = sanitize_html(v.get("description", ""))
                action_response = MDX.as_param(name=k, typ=str(v.get("type", "")), doc=doc)
                action_responses.append(action_response)

            # Add sections to action content
            action_content.append("\n**Action Parameters**\n")
            action_content.append("\n".join(action_params))

            action_content.append("\n**Action Response**\n")
            action_content.append("\n".join(action_responses))

            # Create accordion for this action, sanitizing the title
            safe_action_name = action.name

            # Check for operator patterns in the action name (<4mb type issues)
            if "<" in safe_action_name or ">" in safe_action_name:
                # Handle comparison operators that cause MDX parsing issues
                safe_action_name = re.sub(r"<(\d+)", r"less than \1", safe_action_name)
                safe_action_name = re.sub(r">(\d+)", r"greater than \1", safe_action_name)
                safe_action_name = re.sub(r"<=(\d+)", r"less than or equal to \1", safe_action_name)
                safe_action_name = re.sub(
                    r">=(\d+)", r"greater than or equal to \1", safe_action_name
                )

                # Handle remaining < and > characters
                safe_action_name = safe_action_name.replace("<", "&lt;").replace(">", "&gt;")

            all_action_content.append(MDX.as_accordion(safe_action_name, "\n".join(action_content)))

        # Only wrap in accordion group if there are actions
        if all_action_content:
            self._blocks.append(MDX.as_accordion_group("\n".join(all_action_content)))
        else:
            self._blocks.append("""This app has actions coming soon! Feel free to raise a request for it in our [GitHub Issues](https://github.com/ComposioHQ/composio/issues).
                                
                                You can also create [custom actions](/tool-calling/customizing-tools#extending-composio-toolkits) for the app using Composio Auth.""")
        return self

    def __str__(self) -> str:
        """Convert document content to string."""
        return "\n\n".join(self._blocks)


class ToolDocGenerator:
    """
    Tool Documentation Generator for Composio.

    Generates MDX documentation files for Composio tools.
    """

    def __init__(self, include_local: bool = False):
        """
        Initialize the tool documentation generator.

        Args:
            include_local: Whether to include local development tools
            skip_lint: Whether to skip the linting step
        """
        # Load environment variables
        load_dotenv()

        # Initialize toolset
        self.toolset = ComposioToolSet()
        self.include_local = include_local
        self.actions_obj = Actions(self.toolset.client)

        # For tracking generated tools
        self.generated_tools = []
        self.problematic_actions = []

    def generate_docs(self, output_path: Path, max_workers: int | None = None) -> None:
        """
        Generate documentation for all apps in parallel.

        Args:
            output_path: Path to output directory
            max_workers: Maximum number of parallel workers (default: CPU count * 5)
        """
        # Ensure output directory exists
        output_path.mkdir(parents=True, exist_ok=True)

        # Get all apps
        apps = self.toolset.get_apps(include_local=self.include_local)
        logger.info(f"Starting documentation generation for {len(apps)} apps")

        # Track failures with a synchronized list
        from threading import Lock

        failed_apps = []
        failed_apps_lock = Lock()

        # Set default max workers if not specified
        if max_workers is None:
            import multiprocessing

            # Use CPU count as default but cap at 10 to avoid connection pool issues
            max_workers = min(10, multiprocessing.cpu_count())

        def process_app(app):
            """Process a single app with proper exception handling"""
            try:
                self._generate_app_doc(app, output_path)
                logger.info(f"✅ Generated docs for {app.name}")
                return True
            except Exception as e:
                with failed_apps_lock:
                    failed_apps.append((app.name, str(e)))
                logger.error(f"❌ Failed to generate docs for {app.name}: {e}")
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(traceback.format_exc())
                return False

        # Use ThreadPoolExecutor for parallel processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all app processing tasks
            future_to_app = {executor.submit(process_app, app): app for app in apps}

            # Collect results as they complete
            success_count = 0
            for future in concurrent.futures.as_completed(future_to_app):
                if future.result():
                    success_count += 1

        # Log final statistics
        if failed_apps:
            logger.warning("\nFailed to generate docs for the following apps:")
            for app_name, error in failed_apps:
                logger.warning(f"- {app_name}: {error}")
            logger.warning(f"\nTotal failed apps: {len(failed_apps)}/{len(apps)}")
        else:
            logger.info(f"\nSuccessfully generated docs for all {len(apps)} apps!")

        logger.info(f"Generated {success_count} app docs in parallel using {max_workers} workers")

        # Update docs.yml with the generated tools
        self.update_docs_yml(output_path.parent / "docs.yml")

    def _generate_app_doc(self, app: App, output_path: Path) -> None:
        """
        Generate documentation for a single app.

        Args:
            app: The app to generate documentation for
            output_path: Output directory path
        """
        # Get app model and actions
        app_model = self.toolset.get_app(app.name)
        actions = self.actions_obj._get_actions(apps=[app.name], allow_all=True)

        # Create content
        content = DocumentContent()

        # Add frontmatter
        content.add_frontmatter(titleize(app.name))

        # Handle auth schemes safely
        auth_schemes = None
        try:
            auth_schemes = app_model.auth_schemes
        except Exception as e:
            logger.debug(f"Could not process auth schemes for {app.name}: {e}")
            # Continue without auth schemes

        # Sanitize the app description

        # Add overview section
        content.add_overview_section(
            app_name=app.name,
            app_id=app.key,  # type: ignore
            description=app.description,  # type: ignore
            auth_schemes=auth_schemes,
        )

        # Filter out problematic actions
        filtered_actions = [
            action for action in actions 
            if action.name not in self.problematic_actions
        ]
        # Add actions section (only the filtered ones)
        content.add_actions(filtered_actions)

        # Write to file
        filename = f"{app.name.lower()}.mdx"
        output_file = output_path / filename
        content_str = str(content)

        output_file.write_text(content_str)

        # Track the generated tool for docs.yml update
        with threading.Lock():
            self.generated_tools.append(
                {
                    "name": app.name.lower(),
                    "display_name": titleize(app.name),
                    "path": f"tools/{filename}",
                }
            )

    def update_docs_yml(self, docs_yml_path: Path) -> None:
        """
        Update the docs.yml file with the generated tools.

        Args:
            docs_yml_path: Path to the docs.yml file
        """
        logger.info(f"Updating docs.yml with {len(self.generated_tools)} tools")

        try:
            # Sort tools alphabetically by name
            sorted_tools = sorted(self.generated_tools, key=lambda x: x["name"])

            # Create page entries for generated tools
            tools_contents = []
            for tool in sorted_tools:
                tools_contents.append({"page": tool["display_name"], "path": tool["path"]})

            if USE_RUAMEL:
                # Use ruamel.yaml to preserve comments and formatting
                yaml = YAML()
                yaml.preserve_quotes = True
                yaml.indent(mapping=2, sequence=4, offset=2)

                # Read the current docs.yml
                with open(docs_yml_path, "r") as f:
                    docs_data = yaml.load(f)

                # Find the "tools" tab section in the navigation structure
                for tab_section in docs_data.get("navigation", []):
                    if tab_section.get("tab") == "tools":
                        # Find the tools section
                        for section in tab_section.get("layout", []):
                            if section.get("section") == "Tools":
                                # Preserve the Introduction entry if it exists
                                existing_contents = section.get("contents", [])
                                intro_entries = [
                                    item for item in existing_contents 
                                    if item.get("page") == "Introduction"
                                ]
                                
                                # Add introduction entries first, then the generated tools
                                final_contents = intro_entries + tools_contents
                                
                                # Update the section contents
                                section["contents"] = final_contents
                                break
                        break

                # Write the updated YAML back to the file
                with open(docs_yml_path, "w") as f:
                    yaml.dump(docs_data, f)
            else:
                # Fallback to standard yaml
                # Read the current docs.yml
                with open(docs_yml_path, "r") as f:
                    docs_data = yaml_module.safe_load(f)

                # Find the "tools" tab section in the navigation structure
                for tab_section in docs_data.get("navigation", []):
                    if tab_section.get("tab") == "tools":
                        # Find the tools section
                        for section in tab_section.get("layout", []):
                            if section.get("section") == "Tools":
                                # Preserve the Introduction entry if it exists
                                existing_contents = section.get("contents", [])
                                intro_entries = [
                                    item for item in existing_contents 
                                    if item.get("page") == "Introduction"
                                ]
                                
                                # Add introduction entries first, then the generated tools
                                final_contents = intro_entries + tools_contents
                                
                                # Update the section contents
                                section["contents"] = final_contents
                                break
                        break

                # Write the updated YAML back to the file
                with open(docs_yml_path, "w") as f:
                    yaml_module.dump(docs_data, f, default_flow_style=False, sort_keys=False)

            logger.info(f"✅ Updated docs.yml with {len(self.generated_tools)} tools")

        except Exception as e:
            logger.error(f"Failed to update docs.yml: {e}")
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(traceback.format_exc())


def configure_logging(log_level: str) -> None:
    """
    Configure logging settings.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        raise ValueError(f"Invalid log level: {log_level}")

    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def cli_main() -> int:
    """
    Command-line entry point.

    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    parser = argparse.ArgumentParser(description="Generate Tool Documentation for Composio")
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        help="Path for documentation output (default: ./tools)",
        default="./tools",
    )
    parser.add_argument(
        "--include-local",
        action="store_true",
        help="Include local development tools",
        default=False,
    )
    parser.add_argument(
        "--log-level",
        choices=["debug", "info", "warning", "error", "critical"],
        default="info",
        help="Set logging level",
    )
    parser.add_argument(
        "--workers",
        "-w",
        type=int,
        help="Number of parallel worker threads (default: CPU count)",
        default=None,
    )
    parser.add_argument(
        "--lint-only",
        action="store_true",
        help="Only lint existing MDX files without generating new ones",
        default=False,
    )
    parser.add_argument(
        "--no-lint",
        action="store_true",
        help="Skip the linting step when generating documentation",
        default=False,
    )

    args = parser.parse_args()

    try:
        # Configure logging
        configure_logging(args.log_level)

        # Convert output path to absolute path
        output_path = Path(args.output).resolve()
        # Create generator
        generator = ToolDocGenerator(include_local=args.include_local)

        # Generate docs with specified number of workers
        generator.generate_docs(output_path, max_workers=args.workers)

        return 0
    except Exception as e:
        logger.error(f"Error generating documentation: {e}")
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(traceback.format_exc())
        return 1


def generate_tool_docs(
    output_dir, 
    config=None, 
    include_local=False, 
    log_level="info", 
    workers=None, 
    lint_only=False, 
    no_lint=False
):
    """
    Generate tool documentation
    
    Args:
        output_dir: Path to output directory
        config: Optional path to config file
        include_local: Whether to include local development tools
        log_level: Logging level (debug, info, warning, error, critical)
        workers: Number of parallel worker threads
        lint_only: Only lint existing MDX files without generating new ones
        no_lint: Skip the linting step when generating documentation
    """
    # Configure logging
    configure_logging(log_level)
    
    # Create generator
    generator = ToolDocGenerator(include_local=include_local)
    
    # Generate docs with specified number of workers
    generator.generate_docs(output_dir, max_workers=workers)
    
    return 0


if __name__ == "__main__":
    sys.exit(cli_main())
