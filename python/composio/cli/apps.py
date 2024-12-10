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
from composio.core.cls.did_you_mean import DYMGroup


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


@_apps.command(name="update-types", cls=UpdateExamples)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _update(context: Context) -> None:
    """Updates the local type stubs with the latest app data."""
    # TODO: implement


# TODO: use this to generate updated types
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
            console.print(f"[yellow]⚠️ {cls.__name__}s does not require update[/yellow]")
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
