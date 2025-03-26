import argparse
import json
import logging
import os
import shutil
import sys
import typing as t
from pathlib import Path

from composio.client.collections import Actions, AppAuthScheme, ActionModel
from composio_openai import Action, App, ComposioToolSet
from dotenv import load_dotenv
from inflection import titleize
from mdx_formatter import MDX
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

load_dotenv()
toolset = ComposioToolSet()


class Content:
    def __init__(self):
        self._blocks = []

    def add_frontmatter(self, app_name: str) -> "Content":
        self._blocks.append(MDX.as_frontmatter(app_name))
        return self

    def add_overview_section(
        self,
        app_name: str,
        app_id: str,
        description: str,
        auth_schemes: t.Optional[t.List[AppAuthScheme]] = None,
        tags: t.Optional[list] = None,
    ) -> "Content":
        # Main overview header
        self._blocks.extend(
            [
                "## Overview",
                f"### Enum\n`{app_id.upper()}`",
                f"### Description\n{description}",
            ]
        )
        # Authentication schemes if present
        if auth_schemes:
            self._blocks.append("### Authentication Details")
            for scheme in auth_schemes:
                field_block = []
                for field in scheme.fields:
                    field_block.append(
                        MDX.as_param(
                            name=field.name,
                            required=field.required,
                            typ=field.type,
                            doc=field.description,
                            default=field.default,
                        )
                    )
                self._blocks.append(
                    MDX.as_accordion(
                        title=scheme.auth_mode, content="\n".join(field_block)
                    )
                )

        # Tags if present
        if tags:
            self._blocks.append("### Tags Supported")
            for tag in tags:
                self._blocks.append(f"- `{tag}`")

        return self

    def add_action(self, actions: t.List[ActionModel]) -> "Content":
        # If this is the first action, add the Actions header
        if not any("## Actions" in block for block in self._blocks):
            self._blocks.append("## Actions")
        all_action_content = []

        for action in actions:
            action_content = []
            params = action.parameters
            response = action.response
            action_content.append(action.description.replace("<<", "(").replace(">>", ")"))

            action_params = []
            for k, v in params.properties.items():
                param_content = MDX.as_param(
                    name=k,
                    typ=v.get("type", ""),
                    doc=v.get("description", ""),
                    default=v.get("default", ""),
                    required=k in params.required if params.required else False,
                )
                action_params.append(param_content)

            action_responses = []
            for k, v in response.properties.items():
                action_response = MDX.as_param(
                    name=k,
                    typ=v.get("type"),
                    doc=v.get("description", "")
                )
                action_responses.append(action_response)
            
            action_content.append("\n**Action Parameters**\n")
            action_content.append("\n".join(action_params))

            action_content.append("\n**Action Response**\n")
            action_content.append("\n".join(action_responses))

            all_action_content.append(MDX.as_accordion(action.name, "\n".join(action_content)))

        # Wrap in accordion
        self._blocks.append(MDX.as_accordion_group("\n".join(all_action_content)))
        return self

    def __str__(self) -> str:
        return "\n\n".join(self._blocks)


def main(output: t.Optional[Path] = None):
    output = output or Path.cwd() / "fern" / "tools"
    apps = toolset.get_apps(include_local=False)
    # apps = [toolset.get_app("github")]
    failed_apps = []

    actions_obj = Actions(toolset.client)
    # actions = actions_obj._get_actions(apps=apps, allow_all=True)   #type: ignore
    logger.info(f"Starting documentation generation for {len(apps)} apps")

    for app in apps:
        try:
            content = Content()
            app_model = toolset.get_app(app.name)
            actions = actions_obj._get_actions(apps=[app.name], allow_all=True)
            # Add all sections in order
            content.add_frontmatter(titleize(app.name))
            content.add_overview_section(
                app_name=app.name,
                app_id=app.key,
                description=app.description,
                auth_schemes=app_model.auth_schemes,
            )

            content.add_action(actions)

            # Write to file
            output_path = output / f"{app.name.lower()}.mdx"
            output_path.write_text(str(content))
            logger.info(f"✅ Generated docs for {app.name}")
        except Exception as e:
            failed_apps.append((app.name, traceback.print_exc()))
            logger.error(f"❌ Failed to generate docs for {app.name}")

    if failed_apps:
        logger.warning("\nFailed to generate docs for the following apps:")
        for app_name, error in failed_apps:
            logger.warning(f"- {app_name}: {error}")
        logger.warning(f"\nTotal failed apps: {len(failed_apps)}/{len(apps)}")
    else:
        logger.info(f"\nSuccessfully generated docs for all {len(apps)} apps!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate Tool Documentation for Composio"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,  # Fixed the type parameter to be str instead of "str"
        help="Path for documentation output (default: ./tools)",
        default="./tools",
    )

    args = parser.parse_args()
    output = Path(args.output).resolve()
    main(output=output)
