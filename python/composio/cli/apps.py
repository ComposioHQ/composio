"""
Apps manager for Composio SDK.

Usage:
    composio apps [command] [options]
"""

import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client import enums
from composio.client.collections import ActionModel, AppModel, TriggerModel
from composio.client.local_handler import LocalToolHandler
from composio.core.cls.did_you_mean import DYMGroup
from composio.exceptions import ComposioSDKError


MODULE_TEMPLATE = """\"\"\"
Helper Enum classes.

- TODO: Replace Enums with something lightweight
\"\"\"

from enum import Enum


{tag_enum}

{app_enum}

{action_enum}

{trigger_enum}
"""

TAG_ENUM_TEMPLATE = """class Tag(tuple, Enum):
    \"\"\"App tags.\"\"\"

    @property
    def app(self) -> str:
        \"\"\"Returns app name.\"\"\"
        return self.value[0]

    @property
    def val(self) -> str:
        \"\"\"Returns tag value.\"\"\"
        return self.value[1]

    IMPORTANT = ("default", "important")
{tags}
"""

APP_ENUM_TEMPLATE = """class App(str, Enum):
    \"\"\"Composio App.\"\"\"

    @property
    def is_local(self) -> bool:
        \"\"\"If the app is local.\"\"\"
        return self.value.lower() in [{local_tools}]

{apps}
"""

ACTION_ENUM_TEMPLATE = """class Action(tuple, Enum):
    \"\"\"App action.\"\"\"

    @property
    def app(self) -> str:
        \"\"\"Name of the app where this actions belongs.\"\"\"
        return self.value[0]

    @property
    def action(self) -> str:
        \"\"\"Name of the action.\"\"\"
        return self.value[1]

    @property
    def no_auth(self) -> bool:
        \"\"\"Name of the action.\"\"\"
        return self.value[2]

    @property
    def is_local(self) -> bool:
        \"\"\"If the action is local.\"\"\"
        return len(self.value) > 3 and self.value[3]


    @classmethod
    def from_app(cls, name: str) -> "Action":
        \"\"\"Create Action type enum from app name.\"\"\"
        for action in cls:
            if name == action.app:
                return action
        raise ValueError(f"No action type found for name `{{name}}`")

    @classmethod
    def from_action(cls, name: str) -> "Action":
        \"\"\"Create Action type enum from action name.\"\"\"
        for action in cls:
            if name == action.action:
                return action
        raise ValueError(f"No action type found for name `{{name}}`")

    @classmethod
    def from_app_and_action(cls, app: str, name: str) -> "Action":
        \"\"\"From name and action params.\"\"\"
        for action in cls:
            if app == action.app and name == action.action:
                return action
        raise ValueError("No action type found for app " f"`{{app}}` and action `{{name}}`")

{actions}
"""

TRIGGER_ENUM_TEMPLATE = """class Trigger(tuple, Enum):
    \"\"\"App trigger.\"\"\"

    @property
    def app(self) -> str:
        \"\"\"App name.\"\"\"
        return self.value[0]

    @property
    def event(self) -> str:
        \"\"\"Event name.\"\"\"
        return self.value[1]

{triggers}
"""


class AppsExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio apps", fg="green")
        + click.style("            # List all apps\n", fg="black"),
        click.style("composio apps --enabled", fg="green")
        + click.style("  # List only enabled apps\n", fg="black"),
        click.style("composio apps update", fg="green")
        + click.style("     # Update local Apps database\n", fg="black"),
    ]


@click.group(name="apps", invoke_without_command=True, cls=AppsExamples)
@click.help_option("--help", "-h", "-help")
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show apps which are enabled",
)
@pass_context
def _apps(context: Context, enabled: bool = False) -> None:
    """List composio tools/apps which you have access to"""
    if context.click_ctx.invoked_subcommand:
        return

    try:
        apps = context.client.apps.get()
        if enabled:
            apps = [app for app in apps if app.enabled]
            context.console.print("[green]Showing apps which are enabled[/green]")
        else:
            context.console.print("[green]Showing all apps[/green]")
        for app in apps:
            context.console.print(f"• {app.key}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


class UpdateExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio apps update", fg="green")
        + click.style("  # Update local Apps database\n", fg="black"),
    ]


@_apps.command(name="update", cls=UpdateExamples)
@click.option(
    "--beta",
    is_flag=True,
    help="Include beta apps.",
)
@click.help_option("--help", "-h", "-help")
@pass_context
def _update(context: Context, beta: bool = False) -> None:
    """Updates local Apps database."""
    try:
        apps = sorted(
            context.client.apps.get(),
            key=lambda x: x.key,
        )
        actions = sorted(
            context.client.actions.get(allow_all=True),
            key=lambda x: f"{x.appKey}_{x.name}",
        )
        triggers = sorted(
            context.client.triggers.get(),
            key=lambda x: f"{x.appKey}_{x.name}",
        )
        if not beta:

            def filter_non_beta_items(items):
                filtered_items = []
                for item in items:
                    if not item.name.lower().endswith("beta"):
                        filtered_items.append(item)

                seen = set()
                unique_items = []
                for item in filtered_items:
                    if item.name not in seen:
                        unique_items.append(item)
                        seen.add(item.name)
                return unique_items

            apps = filter_non_beta_items(apps)
            actions = filter_non_beta_items(actions)
            triggers = filter_non_beta_items(triggers)

        enum_module = MODULE_TEMPLATE.format(
            tag_enum=_get_tag_enum(apps=apps, actions=actions),
            app_enum=_get_app_enum(apps=apps),
            action_enum=_get_action_enum(apps=apps, actions=actions),
            trigger_enum=_get_trigger_enum(apps=apps, triggers=triggers),
        )
        with open(enums.__file__, "w", encoding="utf-8") as file:
            file.write(enum_module)
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


def _get_tag_enum(apps: t.List[AppModel], actions: t.List[ActionModel]) -> str:
    """Create Tag enum class."""
    tag_map: t.Dict[str, t.Set[str]] = {}
    for app in apps:
        app_key = app.key
        app_actions = [action for action in actions if action.appKey == app_key]
        for action in app_actions:
            if app_key not in tag_map:
                tag_map[app_key] = set()
            tag_map[app_key].update(action.tags or [])

    tag_enums = ""
    for app_key in sorted(tag_map.keys()):
        sorted_tags = sorted(tag_map[app_key])
        for tag in sorted_tags:
            tag_name = _get_enum_key(f"{app_key}_{tag}")
            tag_enums += f'    {tag_name} = ("{app_key}", "{tag}")\n'
    tag_enums += "\n"
    return TAG_ENUM_TEMPLATE.format(tags=tag_enums)


def _get_app_enum(apps: t.List[AppModel]) -> str:
    """Create App enum class."""
    app_enums = ""
    for app in apps:
        app_name = app.key.upper().replace(" ", "_").replace("-", "_")
        app_enums += f'    {_get_enum_key(app_name)} = "{app.key}"\n'
    local_tools = LocalToolHandler().registered_tools
    local_tools_concat = ", ".join([f'"{tool.tool_name}"' for tool in local_tools])
    for tool in local_tools:
        app_enums += f'    {_get_enum_key(tool.tool_name)} = "{tool.tool_name}"\n'

    return APP_ENUM_TEMPLATE.format(apps=app_enums, local_tools=local_tools_concat)


def _get_action_enum(apps: t.List[AppModel], actions: t.List[ActionModel]) -> str:
    """Get Action enum."""
    action_enums = ""
    for app in apps:
        app_actions = [action for action in actions if action.appKey == app.key]
        for action in app_actions:
            enum_name = f"{_get_enum_key(action.name)}"
            enum_value = f'("{app.key}", "{action.name}", {app.no_auth})'
            action_enums += f"    {enum_name} = {enum_value}\n"
    local_tool_handler = LocalToolHandler()
    for tool in local_tool_handler.registered_tools:
        for action in tool.actions():
            enum_name = f"{_get_enum_key(action().get_tool_merged_action_name())}"  # type: ignore
            enum_value = f'("{tool.tool_name}", "{tool.tool_name}_{action().action_name}", True, True)'  # type: ignore
            action_enums += f"    {enum_name} = {enum_value}\n"
    return ACTION_ENUM_TEMPLATE.format(actions=action_enums)


def _get_trigger_enum(
    apps: t.List[AppModel],
    triggers: t.List[TriggerModel],
) -> str:
    """Get Trigger enum."""
    trigger_enums = ""
    for app in apps:
        app_triggers = [trigger for trigger in triggers if trigger.appKey == app.key]
        for trigger in app_triggers:
            enum_name = f"{_get_enum_key(app.key.upper())}_{_get_enum_key(trigger.display_name)}"
            enum_value = f'("{app.key}", "{trigger.name}")'
            trigger_enums += f"    {enum_name} = {enum_value}\n"
    return TRIGGER_ENUM_TEMPLATE.format(triggers=trigger_enums)


def _get_enum_key(name: str) -> str:
    characters_to_replace = [" ", "-", "/", "(", ")", "\\", ":", '"', "'", "."]
    for char in characters_to_replace:
        name = name.replace(char, "_")
    return name.upper()
