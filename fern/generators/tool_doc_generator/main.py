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

# Disable telemetry to avoid background network requests
os.environ["COMPOSIO_TELEMETRY_DISABLED"] = "true"
os.environ["COMPOSIO_DISABLE_TELEMETRY"] = "true"
os.environ["TELEMETRY_DISABLED"] = "true"

# Import MDX linting functionality
from composio import Composio
from composio.client.types import (
    Tool,
    toolkit_list_response,
    toolkit_retrieve_response,
)
from dotenv import load_dotenv
from inflection import titleize
from generators.tool_doc_generator.mdx_formatter import MDX
from generators.tool_doc_generator.base_docs import base_layout

# Import from the same directory


IMPORTANT_TOOL_SLUGS = [
    "twitter",
    "gmail",
    "github",
    "notion",
    "googlesheets",
    "shopify",
    "stripe",
]


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


# Configure logging
logger = logging.getLogger(__name__)


class TelemetryFilter(logging.Filter):
    """Filter out telemetry-related log messages"""

    def filter(self, record):
        # Filter out telemetry-related messages
        message = record.getMessage()
        telemetry_keywords = [
            "telemetry.composio.dev",
            "telemetry",
            "TELEMETRY",
            "metrics/invocations",
            "errors",
        ]

        # Also filter by logger name
        if "telemetry" in record.name.lower():
            return False

        # Filter by message content
        for keyword in telemetry_keywords:
            if keyword in message:
                return False

        return True


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

    def add_frontmatter(self, app_name: str, category: t.Optional[str] = None) -> "DocumentContent":
        """
        Add frontmatter section to the document.

        Args:
            app_name: The name of the application
            category: The category of the application

        Returns:
            Self reference for method chaining
        """
        self._blocks.append(MDX.as_frontmatter(app_name, category))
        return self

    def add_overview_section(
        self,
        app_name: str,
        app_id: str,
        description: str,
        auth_schemes: t.Optional[t.List[toolkit_retrieve_response.AuthConfigDetail]] = None,
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
                f"**SLUG**: `{app_id.upper()}`",
                f"### Description\n{sanitize_html(description)}",
            ]
        )

        # Authentication schemes if present
        if auth_schemes:
            self._add_auth_schemes(auth_schemes)

        # Tags if present
        if tags:
            self._blocks.append("### Tags Supported")
            for tag in tags:
                self._blocks.append(f"- `{tag}`")

        return self

    def add_connection_section(
        self,
        app_name: str,
        app_slug: str,
        auth_schemes: t.Optional[t.List[toolkit_retrieve_response.AuthConfigDetail]] = None,
    ) -> None:
        schemes = ", ".join(
            self._get_auth_type(s) for s in (auth_schemes or []) if self._extract_auth_fields(s)
        )
        self._blocks.extend(
            [
                f"""## Connecting to {app_name}
### Create an auth config
Use the dashboard to create an auth config for the {app_name} toolkit. This allows you to connect multiple {app_name} accounts to Composio for agents to use.

<Steps>
  <Step title="Select App">
    Navigate to **[{app_name}](https://platform.composio.dev?next_page=/marketplace/{app_name})**.
  </Step>
  <Step title="Configure Auth Config Settings">
    Select among the supported auth schemes of and configure them here.
  </Step>
  <Step title="Create and Get auth config ID">
    Click **"Create {app_name} Auth Config"**. After creation, **copy the displayed ID starting with `ac_`**. This is your auth config ID. This is _not_ a sensitive ID -- you can save it in environment variables or a database.
    **This ID will be used to create connections to the toolkit for a given user.**
  </Step>
</Steps>
"""
            ],
        )

        # Add auth code snippets
        self._add_auth_section(app_name, app_slug, auth_schemes)

    def _add_auth_section(
        self,
        app_name: str,
        app_slug: str,
        auth_schemes: t.List[toolkit_retrieve_response.AuthConfigDetail] = None,
    ) -> None:
        """Add code snippets for each auth scheme using direct template processing"""
        if not auth_schemes:
            return
        
        self._blocks.append("### Connect Your Account")
        
        # Group auth schemes by type to avoid duplicates
        seen_auth_types = set()
        
        for scheme in auth_schemes:
            # Get normalized auth type
            auth_type_display = self._get_auth_type(scheme)
            auth_type_key = auth_type_display.lower().replace(" ", "_")
            
            # Skip if we've already shown this auth type or if it's no_auth
            if auth_type_key in seen_auth_types or auth_type_key == "no_auth":
                continue
            seen_auth_types.add(auth_type_key)

            # Add section for this auth type
            self._blocks.append(f"#### Using {auth_type_display}")
            
            # Prepare variables for template replacement
            template_vars = {
                "toolkit_name": app_name,
                "toolkit_slug": app_slug.lower(),
                "auth_config_id": f"ac_YOUR_{app_slug.upper()}_CONFIG_ID",
                "user_id": "user@example.com",
                "api_key_placeholder": f"your_{app_slug.lower()}_api_key",
                "username_placeholder": f"your_{app_slug.lower()}_username",
                "password_placeholder": f"your_{app_slug.lower()}_password",
                "bearer_token_placeholder": f"your_{app_slug.lower()}_bearer_token"
            }
            
            try:
                # Create code blocks using the new template method
                python_block = MDX.as_code_block_from_template(
                    f"templates/python/{auth_type_key}.py",
                    template_vars=template_vars,
                    title="Python",
                    max_lines=40,
                    word_wrap=True
                )
                
                typescript_block = MDX.as_code_block_from_template(
                    f"templates/typescript/{auth_type_key}.ts",
                    template_vars=template_vars,
                    title="TypeScript",
                    max_lines=40,
                    word_wrap=True
                )
                
                # Add code blocks wrapped in CodeGroup
                self._blocks.append(MDX.as_code_group(python_block, typescript_block))
                
            except Exception as e:
                logger.warning(f"Failed to process auth template for {auth_type_key}: {e}")
                # Fallback to a simple message if template processing fails
                self._blocks.append(f"*Authentication template for {auth_type_display} coming soon*")

    def _add_auth_schemes(
        self, auth_schemes: t.List[toolkit_retrieve_response.AuthConfigDetail]
    ) -> None:
        """Add authentication schemes section."""
        self._blocks.append("### Authentication Details")

        for scheme in auth_schemes:
            fields = self._extract_auth_fields(scheme)
            if fields:
                auth_type = self._get_auth_type(scheme)
                self._blocks.append(MDX.as_accordion(auth_type, "\n".join(fields)))

    def _extract_auth_fields(
        self, scheme: toolkit_retrieve_response.AuthConfigDetail
    ) -> t.List[str]:
        """Extract authentication fields from scheme."""
        fields = []

        if hasattr(scheme, "fields") and scheme.fields:
            for field in scheme.fields:
                fields.extend(self._process_tuple_field(field))

        return fields

    def _process_tuple_field(self, field: tuple) -> t.List[str]:
        """Process tuple-style authentication field."""
        fields = []
        _, field_config = field

        for field_list, required in [
            (getattr(field_config, "required", []), True),
            (getattr(field_config, "optional", []), False),
        ]:
            for f in field_list:
                if hasattr(f, "name"):
                    fields.append(self._create_param_from_field(f, required))

        return fields

    def _create_param_from_field(
        self, field: toolkit_retrieve_response.AuthConfigDetail, required: t.Optional[bool] = None
    ) -> str:
        """Create parameter string from field object."""
        return MDX.as_param(
            name=str(field.name).replace('"', '\\"'),
            required=required if required is not None else getattr(field, "required", False),
            typ=str(getattr(field, "type", "")).replace('"', '\\"'),
            default=str(getattr(field, "default", "")).replace('"', '\\"')
            if getattr(field, "default", None)
            else "",
            doc=str(getattr(field, "description", "")).replace('"', '\\"'),
        )

    def _get_auth_type(self, scheme: toolkit_retrieve_response.AuthConfigDetail) -> str:
        """Get authentication type from scheme."""
        auth_type = (
            getattr(scheme, "mode", None)
            or getattr(scheme, "type", None)
            or getattr(scheme, "auth_type", None)
            or getattr(scheme, "auth_mode", None)
            or "Authentication"
        )

        auth_type_mapping = {
            "oauth2": "OAuth2",
            "OAUTH2": "OAuth2",
            "api_key": "API Key",
            "API_KEY": "API Key",
            "bearer_token": "Bearer Token",
            "BEARER_TOKEN": "Bearer Token",
            "basic": "Basic Auth",
            "BASIC": "Basic Auth",
            "no_auth": "No Authentication",
            "NO_AUTH": "No Authentication",
        }

        return auth_type_mapping.get(auth_type, auth_type.replace("_", " ").title())

    def add_actions(self, actions: t.List[Tool], app_name: str, app_slug: str) -> "DocumentContent":
        """
        Add actions section to the document.

        Args:
            actions: List of tool models to document
            app_name: The name of the application
            app_slug: The application slug

        Returns:
            Self reference for method chaining
        """
        # If this is the first action, add the Actions header
        if not any("## Tools" in block for block in self._blocks):
            self._blocks.append("## Tools")
            self._blocks.append("### Executing tools")
            self._blocks.append(f"""To prototype you can execute some tools to see the responses and working on the [{app_name} toolkit's playground](https://app.composio.dev/app/{app_name})""")
            self._blocks.append("")
            self._blocks.append("For code examples, see the [Tool calling guide](/tool-calling/executing-tool-calls) and [Provider examples](/provider-apis).")
            self._blocks.append("### Tool List")

        action_contents = []

        logger.info(f"Processing {len(actions)} actions for documentation")
        for i, tool in enumerate(actions):
            content = self._process_tool(tool)
            if content:
                action_contents.append(content)

        # Only wrap in accordion group if there are actions
        if action_contents:
            self._blocks.append(MDX.as_accordion_group("\n".join(action_contents)))
        else:
            logger.info(f"No action content generated for {len(actions)} tools")
            self._blocks.append("""This app has actions coming soon! Feel free to raise a request for it in our [GitHub Issues](https://github.com/ComposioHQ/composio/issues).
                                
                                You can also create [custom actions](/tool-calling/customizing-tools#extending-composio-toolkits) for the app using Composio Auth.""")
        return self

    def _process_tool(self, tool: Tool) -> t.Optional[str]:
        """Process a single tool and return accordion content."""
        tool_data = self._extract_tool_data(tool)
        if not tool_data["name"]:
            return None

        content = [
            f"**Tool Name:** {self._sanitize_action_name(tool_data['name'])}\n\n**Description**\n",
            MDX.as_code_block(tool_data["description"], "text"),
        ]

        # Add parameters
        content.append("\n**Action Parameters**\n")
        content.append("\n".join(self._process_parameters(tool_data["params"])))

        # Add responses
        content.append("\n**Action Response**\n")
        content.append("\n".join(self._process_parameters(tool_data["response"])))

        # safe_name = self._sanitize_action_name(tool_data['name'])
        return MDX.as_accordion(tool_data["slug"], "\n".join(content))

    def _extract_tool_data(self, tool: Tool) -> t.Dict[str, t.Any]:
        """Extract data from tool object or dict."""

        return {
            "name": tool.name or tool.slug,
            "description": tool.description,
            "slug": tool.slug,
            "params": tool.input_parameters,
            "response": tool.output_parameters,
        }

    def _process_parameters(self, params: t.Any) -> t.List[str]:
        """Process parameters from various formats."""
        if not params or not isinstance(params, dict):
            return []

        param_list = []

        if "properties" in params:
            properties = params.get("properties", {})
            required = params.get("required", [])

            for name, schema in properties.items():
                param_list.append(
                    MDX.as_param(
                        name=name,
                        typ=str(schema.get("type", "")),
                        doc=sanitize_html(schema.get("description", "")),
                        default=schema.get("default", ""),
                        required=name in required,
                    )
                )
        else:
            for name, schema in params.items():
                if isinstance(schema, dict):
                    param_list.append(
                        MDX.as_param(
                            name=name,
                            typ=str(schema.get("type", "")),
                            doc=sanitize_html(schema.get("description", "")),
                            default=schema.get("default", ""),
                            required=schema.get("required", False),
                        )
                    )

        return param_list

    def _sanitize_action_name(self, name: str) -> str:
        """Sanitize action name for MDX."""
        if "<" in name or ">" in name:
            replacements = [
                (r"<(\d+)", r"less than \1"),
                (r">(\d+)", r"greater than \1"),
                (r"<=(\d+)", r"less than or equal to \1"),
                (r">=(\d+)", r"greater than or equal to \1"),
            ]
            for pattern, replacement in replacements:
                name = re.sub(pattern, replacement, name)
            name = name.replace("<", "&lt;").replace(">", "&gt;")

        return name

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
        """
        # Load environment variables
        load_dotenv()

        # Initialize composio client
        self.composio = Composio()
        self.include_local = include_local

        # For tracking generated tools
        self.generated_tools = []
        self.problematic_actions = []

    def generate_docs(
        self, output_path: Path, max_workers: int | None = None, limit: int | None = None
    ) -> None:
        """
        Generate documentation for all apps in parallel.

        Args:
            output_path: Path to output directory
            max_workers: Maximum number of parallel workers (default: CPU count * 5)
            limit: Limit processing to first N toolkits (for debugging)
        """
        # Ensure output directory exists
        output_path.mkdir(parents=True, exist_ok=True)

        # Get all apps
        toolkits = self.composio.toolkits.get()

        # Apply limit if specified
        if limit is not None:
            toolkits = toolkits[:limit]
            logger.info(f"Limited to first {limit} toolkits")

        logger.info(f"Starting documentation generation for {len(toolkits)} toolkits")

        # Track failures with a synchronized list
        from threading import Lock

        failed_apps = []
        failed_apps_lock = Lock()

        # Set default max workers if not specified
        if max_workers is None:
            import multiprocessing

            # Use CPU count as default but cap at 10 to avoid connection pool issues
            max_workers = min(10, multiprocessing.cpu_count())

        def process_app(toolkit):
            """Process a single toolkit with proper exception handling"""
            try:
                self._generate_app_doc(toolkit, output_path)
                logger.info(f"✅ Generated docs for {toolkit.name}")
                return True
            except Exception as e:
                with failed_apps_lock:
                    failed_apps.append((toolkit.name, str(e)))
                logger.error(f"❌ Failed to generate docs for {toolkit.name}: {e}")
                if logger.isEnabledFor(logging.DEBUG):
                    logger.info(traceback.format_exc())
                return False

        # Use ThreadPoolExecutor for parallel processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all app processing tasks
            future_to_app = {executor.submit(process_app, toolkit): toolkit for toolkit in toolkits}

            # Collect results as they complete
            success_count = 0
            for future in concurrent.futures.as_completed(future_to_app):
                if future.result():
                    success_count += 1

        # Log final statistics
        if failed_apps:
            logger.warning("\nFailed to generate docs for the following toolkits:")
            for app_name, error in failed_apps:
                logger.warning(f"- {app_name}: {error}")
            logger.warning(f"\nTotal failed toolkits: {len(failed_apps)}/{len(toolkits)}")
        else:
            logger.info(f"\nSuccessfully generated docs for all {len(toolkits)} toolkits!")

        logger.info(
            f"Generated {success_count} toolkit docs in parallel using {max_workers} workers"
        )

        # Update docs.yml with the generated tools
        self.update_docs_yml(output_path.parent / "docs.yml")

    def _generate_app_doc(self, toolkit: toolkit_list_response.Item, output_path: Path) -> None:
        """
        Generate documentation for a single toolkit.

        Args:
            toolkit: The toolkit to generate documentation for
            output_path: Output directory path
        """
        # Get toolkit model and tools
        toolkit_model = self.composio.toolkits.get(slug=toolkit.slug)
        tools = self.composio.tools.get_raw_composio_tools(toolkits=[toolkit.slug], limit=99999)
        logger.info(f"Toolkit tools: {toolkit}")

        logger.info(f"Retrieved {len(tools)} tools for {toolkit.name}")
        if tools:
            logger.debug(f"First tool type: {type(tools[0])}")
            if hasattr(tools[0], "__dict__"):
                logger.debug(f"First tool attributes: {list(tools[0].__dict__.keys())}")
            elif isinstance(tools[0], dict):
                logger.debug(f"First tool dict keys: {list(tools[0].keys())}")
            logger.debug(f"Sample tool: {str(tools[0])[:200]}...")

        # Create content
        content = DocumentContent()
        
        # Special case for Monday - use lowercase everywhere
        display_name = toolkit.name
        if toolkit.name == "Monday":
            display_name = "monday"

        # Extract category from toolkit meta
        category = None
        if toolkit_model.meta.categories:
            # Use the first category if multiple exist
            category = (
                toolkit_model.meta.categories[0].get("name")
                if isinstance(toolkit_model.meta.categories[0], dict)
                else getattr(toolkit_model.meta.categories[0], "name", None)
            )

        # Add frontmatter
        content.add_frontmatter(display_name, category)

        # Handle auth schemes safely
        auth_schemes = None
        try:
            auth_schemes = toolkit_model.auth_config_details
        except Exception as e:
            logger.info(f"Could not process auth schemes for {display_name}: {e}")
            # Continue without auth schemes

        no_auth = "NO_AUTH" in (toolkit.auth_schemes or [])

        logger.info(f"No auth: {no_auth}")

        # Add overview section
        # For no-auth tools, don't pass auth_schemes to avoid showing authentication details
        content.add_overview_section(
            app_name=display_name,
            app_id=toolkit.slug,
            description=toolkit.meta.description,
            auth_schemes=None if no_auth else auth_schemes,
        )

        # Only add connection section if authentication is required
        if not no_auth:
            content.add_connection_section(
                app_name=display_name, app_slug=toolkit.slug, auth_schemes=auth_schemes
            )

        # Filter out problematic actions
        filtered_tools = []
        for tool in tools:
            # Extract tool slug for filtering
            if isinstance(tool, dict):
                if "function" in tool:
                    tool_slug = tool["function"].get("name", "")
                else:
                    tool_slug = tool.get("slug", "")
            else:
                tool_slug = getattr(tool, "slug", "")

            if tool_slug not in self.problematic_actions:
                filtered_tools.append(tool)
            else:
                logger.info(f"Filtered out problematic tool: {tool_slug}")

        logger.info(f"After filtering: {len(filtered_tools)} tools remaining out of {len(tools)}")

        # Add actions section (only the filtered ones)
        content.add_actions(filtered_tools, app_name=display_name, app_slug=toolkit.slug)

        # Write to file
        filename = f"{toolkit.slug.lower()}.mdx"
        output_file = output_path / filename
        content_str = str(content)

        output_file.write_text(content_str)

        # Track the generated tool for docs.yml update
        with threading.Lock():
            # Special case for Monday - keep it lowercase in sidebar too
            if toolkit.name == "Monday":
                yml_display_name = "monday"
            else:
                yml_display_name = titleize(toolkit.name.lower())
            
            self.generated_tools.append(
                {
                    "name": toolkit.slug.lower(),
                    "display_name": yml_display_name,
                    "path": f"toolkits/{filename}",
                    "category": category,
                    "tool_count": len(tools),
                    "no_auth": no_auth,
                }
            )

    def update_docs_yml(self, docs_yml_path: Path) -> None:
        """
        Update the docs.yml file with the generated tools, grouped by section:
        - Important
        - Categories (each key becomes a section)
        - Proxy Apps
        - No Auth

        Args:
            docs_yml_path: Path to the docs.yml file
        """
        import yaml  # Use PyYAML for writing

        logger.info(f"Updating docs.yml with {len(self.generated_tools)} tools")

        try:
            # Sort tools alphabetically by name
            sorted_tools = sorted(self.generated_tools, key=lambda x: x["name"])

            # Prepare sections
            important_tools = []
            proxy_apps = []
            no_auth_tools = []
            categories: dict[str, list] = {}

            for tool in sorted_tools:
                entry = {
                    "page": tool["display_name"],
                    "slug": "toolkits/" + tool["name"],
                    "path": tool["path"],
                }
                name = tool["name"]
                category = tool.get("category", "").strip()

                if name in IMPORTANT_TOOL_SLUGS:
                    important_tools.append(entry)
                elif tool.get("tool_count") == 0:
                    proxy_apps.append(entry)
                elif tool.get("no_auth"):
                    no_auth_tools.append(entry)
                elif category:
                    lower_category = category.lower()
                    if lower_category not in categories:
                        categories[lower_category] = []
                    categories[lower_category].append(entry)

            # Read the current docs.yml
            with open(docs_yml_path, "r") as f:
                docs_data = yaml.safe_load(f)

            logger.info(f"Important tools: {important_tools}")
            logger.info(f"Proxy apps: {proxy_apps}")
            logger.info(f"No auth tools: {no_auth_tools}")

            # Sort categories by number of elements (descending), then by name
            sorted_categories = sorted(
                categories.items(), key=lambda item: (-len(item[1]), item[0])
            )

            logger.info(f"Category keys: {list(categories.keys())}")
            logger.info(f"Sorted categories keys: {[cat for cat, _ in sorted_categories]}")

            # Find the "tools" tab section in the navigation structure
            for tab_section in docs_data.get("navigation", []):
                if tab_section.get("tab") == "toolkits":
                    logger.info(f"Tab section: {tab_section}")
                    new_layout = []

                    # Always add the Tool section with Introduction first
                    new_layout.append(base_layout[0])

                    # Add Important section if present
                    if important_tools:
                        new_layout.append(
                            {
                                "section": "Important",
                                "skip-slug": True,
                                "contents": important_tools,
                            }
                        )

                    # Add each category as its own section
                    for cat, tools_list in sorted_categories:
                        if tools_list:
                            new_layout.append(
                                {
                                    "section": titleize(cat),
                                    "skip-slug": True,
                                    "contents": tools_list,
                                }
                            )

                    # Add Proxy Apps section if present
                    if proxy_apps:
                        new_layout.append(
                            {
                                "section": "Proxy Apps",
                                "skip-slug": True,
                                "contents": proxy_apps,
                            }
                        )

                    # Add No Auth section if present
                    if no_auth_tools:
                        new_layout.append(
                            {
                                "section": "No Auth",
                                "skip-slug": True,
                                "contents": no_auth_tools,
                            }
                        )

                    logger.info("new_layout: %s", new_layout)
                    tab_section["layout"] = new_layout
                    break

            # Write the updated YAML back to the file
            with open(docs_yml_path, "w") as f:
                yaml.dump(docs_data, f, default_flow_style=False, sort_keys=False)

            logger.info(f"✅ Updated docs.yml with {len(self.generated_tools)} tools")

        except Exception as e:
            logger.error(f"Failed to update docs.yml: {e}")
            if logger.isEnabledFor(logging.DEBUG):
                logger.info(traceback.format_exc())


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

    # Add telemetry filter to root logger to filter out telemetry requests
    telemetry_filter = TelemetryFilter()
    logging.getLogger().addFilter(telemetry_filter)

    # Also add filter to specific loggers that might handle HTTP requests
    for logger_name in ["httpx", "urllib3", "requests"]:
        logging.getLogger(logger_name).addFilter(telemetry_filter)


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
        default="./toolkits",
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
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        help="Limit processing to first N toolkits (for debugging)",
        default=None,
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
        generator.generate_docs(output_path, max_workers=args.workers, limit=args.limit)

        # Force exit immediately without waiting for background telemetry
        logger.info("Documentation generation complete. Exiting immediately.")
        os._exit(0)
    except Exception as e:
        logger.error(f"Error generating documentation: {e}")
        if logger.isEnabledFor(logging.DEBUG):
            logger.info(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(cli_main())
