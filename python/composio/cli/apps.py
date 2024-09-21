"""
Apps manager for Composio SDK.

Usage:
    composio apps [command] [options]
"""

import ast
import inspect
import typing as t
from pathlib import Path

import click

from composio.cli.context import Context, get_context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client import enums
from composio.client.collections import ActionModel, AppModel, TriggerModel
from composio.core.cls.did_you_mean import DYMGroup
from composio.tools.local import load_local_tools
from composio.utils import get_enum_key


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
@handle_exceptions()
@pass_context
def _apps(context: Context, enabled: bool = False) -> None:
    """List composio tools/apps which you have access to"""
    if context.click_ctx.invoked_subcommand:
        return

    apps = context.client.apps.get()
    if enabled:
        apps = [app for app in apps if app.enabled]
        context.console.print("[green]Showing apps which are enabled[/green]")
    else:
        context.console.print("[green]Showing all apps[/green]")

    for app in apps:
        context.console.print(f"• {app.key}")


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
@handle_exceptions()
@pass_context
def _update(context: Context, beta: bool = False) -> None:
    """Updates local Apps database."""
    update(context=context, beta=beta)


def update(context: Context, beta: bool = False) -> None:
    """Update apps."""
    apps = sorted(
        context.client.apps.get(),
        key=lambda x: x.key,
    )
    actions = sorted(
        context.client.actions.get(allow_all=True),
        key=lambda x: f"{x.appName}_{x.name}",
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

    _update_apps(apps=apps)
    _update_tags(apps=apps, actions=actions)
    _update_actions(apps=apps, actions=actions)
    _update_triggers(apps=apps, triggers=triggers)


def _update_apps(apps: t.List[AppModel]) -> None:
    """Create App enum class."""
    app_names = []
    enums.base.APPS_CACHE.mkdir(
        exist_ok=True,
    )
    for app in apps:
        app_names.append(
            get_enum_key(
                name=app.key.lower().replace(" ", "_").replace("-", "_"),
            )
        )
        enums.base.AppData(
            name=app.name,
            path=enums.base.APPS_CACHE / app_names[-1],
            is_local=False,
        ).store()

    for tool in load_local_tools()["local"].values():
        if tool.enum in app_names:
            continue

        app_names.append(tool.enum)
        enums.base.AppData(
            name=tool.name,
            path=enums.base.APPS_CACHE / app_names[-1],
            is_local=True,
        ).store()

    _update_annotations(
        cls=enums.App,
        attributes=app_names,
    )


def _update_actions(apps: t.List[AppModel], actions: t.List[ActionModel]) -> None:
    """Get Action enum."""
    enums.base.ACTIONS_CACHE.mkdir(exist_ok=True)
    deprecated = {}
    action_names = []
    for app in sorted(apps, key=lambda x: x.key):
        for action in actions:
            if action.appName != app.key:
                continue

            if (
                action.description is not None
                and "<<DEPRECATED use " in action.description
            ):
                _, newact = action.description.split("<<DEPRECATED use ", maxsplit=1)
                deprecated[get_enum_key(name=action.name)] = (
                    action.appName.lower() + "_" + newact.replace(">>", "")
                ).upper()
            else:
                action_names.append(get_enum_key(name=action.name))

            enums.base.ActionData(
                name=action.name,
                app=app.key,
                tags=action.tags,
                no_auth=app.no_auth,
                is_local=False,
                path=enums.base.ACTIONS_CACHE / get_enum_key(name=action.name),
            ).store()

    processed = []
    for tool in load_local_tools()["local"].values():
        if tool.name in processed:
            continue

        processed.append(tool.name)
        for actcls in tool.actions():
            action_names.append(actcls.enum)
            enums.base.ActionData(
                name=actcls.enum,
                app=tool.name,
                tags=actcls.tags(),
                no_auth=True,
                is_local=True,
                path=enums.base.ACTIONS_CACHE / action_names[-1],
                shell=False,
            ).store()

    _update_annotations(
        cls=enums.Action,
        attributes=action_names,
        deprecated=deprecated,
    )


def _update_tags(apps: t.List[AppModel], actions: t.List[ActionModel]) -> None:
    """Create Tag enum class."""
    enums.base.TAGS_CACHE.mkdir(exist_ok=True)
    tag_map: t.Dict[str, t.Set[str]] = {}
    for app in apps:
        app_name = app.key
        for action in [action for action in actions if action.appName == app_name]:
            if app_name not in tag_map:
                tag_map[app_name] = set()
            tag_map[app_name].update(action.tags or [])

    tag_names = ["DEFAULT"]
    for app_name in sorted(tag_map):
        for tag in sorted(tag_map[app_name]):
            tag_name = get_enum_key(name=f"{app_name}_{tag}")
            tag_names.append(tag_name)
            enums.base.TagData(
                app=app_name,
                value=tag,
                path=enums.base.TAGS_CACHE / tag_names[-1],
            ).store()

    enums.base.TagData(
        app="default",
        value="important",
        path=enums.base.TAGS_CACHE / "DEFAULT",
    )
    _update_annotations(
        cls=enums.Tag,
        attributes=tag_names,
    )


def _update_triggers(
    apps: t.List[AppModel],
    triggers: t.List[TriggerModel],
) -> None:
    """Get Trigger enum."""
    trigger_names = []
    enums.base.TRIGGERS_CACHE.mkdir(exist_ok=True)
    for app in apps:
        for trigger in triggers:
            if trigger.appKey != app.key:
                continue

            trigger_names.append(get_enum_key(name=trigger.name).upper())
            enums.base.TriggerData(
                name=trigger.name,
                app=app.key,
                path=enums.base.TRIGGERS_CACHE / trigger_names[-1],
            ).store()

    _update_annotations(
        cls=enums.Trigger,
        attributes=trigger_names,
    )


def _update_annotations(
    cls: t.Type,
    attributes: t.List[str],
    deprecated: t.Optional[t.Dict[str, str]] = None,
) -> None:
    """Update annontations for `cls`"""
    console = get_context().console
    file = Path(inspect.getmodule(cls).__file__)  # type: ignore
    annotations = []
    for attribute in sorted(attributes):
        annotations.append(
            ast.AnnAssign(
                target=ast.Name(id=attribute),
                annotation=ast.Constant(value=f"{cls.__name__}"),
                simple=1,
            ),
        )

    _deprecated = []
    _deprecated_names = []
    deprecated = deprecated or {}
    for old, new in deprecated.items():
        if old.lower() == new.lower():
            continue

        if new.upper() not in attributes:
            continue

        _deprecated.append(_build_deprecated_node(old=old, new=new))
        _deprecated_names.append(old.upper())

    tree = ast.parse(file.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if node.name != cls.__name__:
            continue

        cls_attributes = [
            child.target.id  # type: ignore
            for child in node.body[1:]
            if isinstance(child, ast.AnnAssign)
            and child.target.id != "_deprecated"  # type: ignore
        ]
        if set(cls_attributes) == set(attributes):
            console.print(
                f"[yellow]⚠️ {cls.__name__}s does not require update[/yellow]"
            )
            return

        def _filter(child: ast.AST) -> bool:
            if isinstance(child, ast.AnnAssign) and child.target.id == "_deprecated":  # type: ignore
                child.value = ast.Dict(
                    keys=list(map(ast.Constant, deprecated.keys())),  # type: ignore
                    values=list(map(ast.Constant, deprecated.values())),  # type: ignore
                )
                return True
            if isinstance(child, ast.AnnAssign):
                return False
            if isinstance(child, ast.FunctionDef) and child.name in _deprecated_names:
                return False
            if "@te.deprecated" in ast.unparse(child):
                return False
            return True

        body = [child for child in node.body[1:] if _filter(child=child)]
        node.body = node.body[:1] + annotations + _deprecated + body
        break

    code = ast.unparse(tree)
    code = code.replace(
        "@classmethod",
        "@classmethod  # type: ignore",
    )
    code = code.replace(
        "import typing as t",
        "\n# pylint: disable=too-many-public-methods, unused-import\n\nimport typing as t"
        "\nimport typing_extensions as te  # noqa: F401",
    )
    with file.open("w", encoding="utf-8") as fp:
        fp.write(code)
    console.print(f"[green]✔ {cls.__name__}s updated[/green]")


def _build_deprecated_node(old: str, new: str) -> ast.FunctionDef:
    """Function definition."""
    return ast.FunctionDef(
        name=old.upper(),
        args=ast.arguments(
            posonlyargs=[],
            args=[ast.arg(arg="cls")],
            kwonlyargs=[],
            kw_defaults=[],
            defaults=[],
        ),
        body=[
            ast.Return(
                value=ast.Attribute(
                    value=ast.Name(id="cls", ctx=ast.Load()),
                    attr=new.upper(),
                    ctx=ast.Load(),
                )
            )
        ],
        decorator_list=[
            ast.Name(id="classmethod", ctx=ast.Load()),
            ast.Name(id="property", ctx=ast.Load()),
            ast.Call(
                func=ast.Attribute(
                    value=ast.Name(id="te", ctx=ast.Load()),
                    attr="deprecated",
                    ctx=ast.Load(),
                ),
                args=[ast.Constant(value=f"Use {new.upper()} instead.")],
                keywords=[],
            ),
        ],
        returns=ast.Constant(value="Action"),
        lineno=0,
    )
