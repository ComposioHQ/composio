"""
API Documentation generator for Composio SDK.

Usage:
    python PATH_TO_COMPOSIO_REPO PATH_TO_DOCUMENTATION_OUTPUT

Defaults:
    PATH_TO_COMPOSIO_REPO: ./composio
    PATH_TO_DOCUMENTATION_OUTPUT: ./sdk/composio
"""

import os
import sys
import ast
import shutil
import typing as t
import types
import importlib
import inspect
import json

from pathlib import Path
from typing_extensions import TypedDict, Optional

INCLUDE = (
    "client",
    "storage",
    "tools",
    "utils",
    "constants.py",
    "exceptions.py",
)


class MDX:
    """MDX Wrappers."""

    @staticmethod
    def as_title(content: str) -> str:
        """As MDX title."""
        return "---\n" f'title: "{content}"\n' "---\n"

    @staticmethod
    def as_card(content: str) -> str:
        """As MDX Card."""
        return f"<Card>\n{content}\n</Card>\n"

    @staticmethod
    def as_param(name: str, typ: str, doc: str, required: bool = False) -> str:
        """As MDS Param field."""
        return (
            f'<ParamField path="{name}" type="{typ}" {"required" if required else ""}>\n'
            f"{doc}\n"
            "</ParamField>\n"
        )

    @staticmethod
    def as_response(name: str, typ: str, doc: str) -> str:
        """As MDS Param field."""
        return f'<ParamField path="{name}" type="{typ}">\n' f"{doc}\n" "</ParamField>\n"


def import_file(file: Path) -> types.ModuleType:
    """Import file as module."""
    path = ".".join(
        [*file.relative_to(Path.cwd()).parent.parts, file.name.removesuffix(".py")]
    )
    return importlib.import_module(name=path)


def parse_docstrin(docstring: str, types: t.Dict) -> t.Dict[str, str]:
    """Parse docstring metadata."""
    lines = list(
        filter(lambda x: x, [line.lstrip().rstrip() for line in docstring.split("\n")])
    )
    docmeta = {
        "doc": lines.pop(0),
        "params": [],
        "return": None,
        "note": None,
    }
    while len(lines) > 0:
        line = lines.pop(0)
        if line.startswith(":param"):
            name, doc = line.replace(":param ", "").split(": ")
            typ = types.pop(name, "null").replace("t.", "typing.")
            docmeta["params"].append(
                {
                    "name": name,
                    "doc": doc,
                    "type": typ,
                    "required": "Optional" not in typ or typ == "bool",
                }
            )
            continue
        if line.startswith(":return"):
            docmeta["return"] = {
                "name": "return",
                "doc": line.replace(":return:", ""),
                "type": types.pop("return", "null"),
            }
    return docmeta


def handle_constant(node: ast.Assign, doc: ast.Expr) -> str:
    """Handle constant."""
    if len(node.targets) != 1:
        return ""
    (target,) = node.targets
    return f"""
## `{target.id}`

| | |
|---|---|
|value|`{ast.unparse(node.value)}`|
|description|{doc.value.value.lstrip().rstrip()}|
"""


class FunctionParam(TypedDict):
    """Function parameter metadata."""

    name: str
    type: str
    required: bool
    description: str


class FuctionMetadata(TypedDict):
    """Function metadata."""

    name: str
    args: t.List[FunctionParam]
    returns: FunctionParam
    description: str


def parse_docstring(docstring: str) -> t.Dict[str, t.Any]:
    """Parse docstring metadata."""
    description, *lines = filter(
        lambda x: x, [line.lstrip().rstrip() for line in docstring.split("\n")]
    )
    docmeta = {
        "description": description,
        "params": {},
        "raises": {},
        "return": "",
    }
    while len(lines) > 0:
        line = lines.pop(0)
        if line.startswith(":param"):
            name, doc = line.replace(":param ", "").split(": ")
            docmeta["params"][name] = doc
            continue
        if line.startswith(":return"):
            docmeta["return"] = line.replace(":return:", "")
            continue
    return docmeta


def parse_function(node: ast.FunctionDef) -> FuctionMetadata:
    """Parse a function."""
    docstring, *_ = node.body
    if isinstance(docstring, ast.Expr):
        docmeta = parse_docstring(docstring=docstring.value.value)
    else:
        docmeta = {
            "description": "No description provided",
            "params": {},
            "raises": {},
            "return": "No description provided",
        }
    args = []
    for arg in node.args.args:
        if arg.annotation is None:
            continue

        _type = ast.unparse(arg.annotation)
        args.append(
            FunctionParam(
                name=arg.arg,
                type=_type,
                required="Optional" not in _type and "bool" not in _type,
                description=docmeta["params"].get(arg.arg) or "No description provided",
            )
        )

    returns = FunctionParam(
        name="returns",
        type=ast.unparse(node.returns or ast.Constant(None)),
        required=False,
        description=docmeta.get("return") or "No description provided",
    )

    return FuctionMetadata(
        name=node.name,
        args=args,
        returns=returns,
        description=docmeta["description"],
    )


def handle_function(node: ast.FunctionDef) -> str:
    """Handle function definition."""
    funcdef = parse_function(node=node)
    content = f"\n# `def {node.name}`\n"
    content += MDX.as_card(funcdef["description"])
    params = ""
    for param in funcdef["args"]:
        params += MDX.as_param(
            name=param["name"],
            typ=param["type"],
            doc=param["description"],
            required=param["required"],
        )
    if params:
        content += MDX.as_card(params)

    returns = ""
    if funcdef["returns"] is not None:
        returns = MDX.as_response(
            name="returns",
            typ=funcdef["returns"]["type"],
            doc=funcdef["returns"]["description"],
        )
    if returns:
        content += MDX.as_card(returns)
    return content


def handle_class_function(node: ast.FunctionDef) -> str:
    """Handle class function definition."""
    funcdef = parse_function(node=node)
    content = f"\n## `def {node.name}`\n"
    content += MDX.as_card(funcdef["description"])
    params = ""
    for param in funcdef["args"]:
        params += MDX.as_param(
            name=param["name"],
            typ=param["type"],
            doc=param["description"],
            required=param["required"],
        )
    if params:
        content += MDX.as_card(params)

    returns = ""
    if funcdef["returns"] is not None:
        returns = MDX.as_response(
            name="returns",
            typ=funcdef["returns"]["type"],
            doc=funcdef["returns"]["description"],
        )
    if returns:
        content += MDX.as_card(returns)
    return content


def handle_class(node: ast.ClassDef) -> str:
    """Handler class."""
    content = f"# `class {node.name}`\n"
    if isinstance(node.body[0], ast.Expr):
        content += MDX.as_card(
            t.cast(ast.Expr, node.body[0]).value.value.lstrip().rstrip()
        )

    functions = ""
    properties = ""
    for child in node.body:
        if isinstance(child, ast.AnnAssign):
            content += f"""* `property` {ast.unparse(child.target)}: {ast.unparse(child.annotation)}\n"""

        if isinstance(child, ast.FunctionDef):
            functions = "\n" + handle_class_function(node=child)

    content = content[:-1]
    if properties:
        content += MDX.as_card(properties)

    if functions:
        content += functions

    content += "\n---\n"
    return content


def handle_header(header: str) -> str:
    """Handle header."""
    header = header.lstrip().rstrip()
    title, *content = header.split("\n")
    return MDX.as_title(content=title)


def handle_file(file: Path, output: Path) -> None:
    """Handle file."""
    if not file.name.endswith(".py"):
        return

    header, *body = ast.parse(source=file.read_text(encoding="utf-8")).body
    if isinstance(header, ast.Expr):
        content = handle_header(
        header=t.cast(ast.Constant, t.cast(ast.Expr, header).value).value
    )
    else:
        content = ""
    content += "\n"

    while len(body) > 0:
        node = body.pop(0)
        if (
            isinstance(node, ast.Assign)
            and len(body) > 0
            and isinstance(body[0], ast.Expr)
        ):
            content += handle_constant(
                node=node,
                doc=body.pop(0),
            )
            continue

        if isinstance(node, ast.FunctionDef):
            content += handle_function(node=node)
            continue

        if isinstance(node, ast.ClassDef):
            content += handle_class(node=node)
            continue

    outdir = output / Path(
        *file.parent.parts[file.parent.parts.index("composio") + 1 :]
    )
    outdir.mkdir(exist_ok=True, parents=True)
    filename = (
        "index.mdx" if file.name == "__init__.py" else file.name.replace(".py", ".mdx")
    )
    (outdir / filename).write_text(content, encoding="utf-8")
    return str(
        "sdk"
        / Path(*file.parent.parts[file.parent.parts.index("composio") + 1 :])
        / filename.replace(".mdx", "")
    )


def handle_dir(directory: Path, output: Path) -> None:
    """Handle directory."""
    if directory.name == "__pycache__":
        return
    collection = {
        "group": directory.name.title(),
        "pages": [],
    }
    for path in directory.iterdir():
        page = (
            handle_file(file=path, output=output)
            if path.is_file()
            else handle_dir(directory=path, output=output)
        )
        if page is not None:
            collection["pages"].append(page)
    return collection


def main(
    path: t.Optional[Path] = None,
    output: t.Optional[Path] = None,
) -> None:
    """Run documentation generator."""
    output = output or Path.cwd() / "sdk" / "composio"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()

    path = path or Path.cwd() / "composio" / "composio"
    os.chdir(path.parent)

    collection = {
        "group": "Reference",
        "pages": [],
    }
    for include in INCLUDE:
        include = path / include
        collection["pages"].append(
            handle_file(file=include, output=output)
            if include.is_file()
            else handle_dir(directory=include, output=output)
        )

    # TODO: Automate
    print(f"Add following config to `mint.json`\n{json.dumps(collection, indent=2)}")


if __name__ == "__main__":
    path = None
    output = None
    args = sys.argv[1:]
    if len(args) == 2:
        path = Path(args.pop(0)).resolve()
        output = Path(args.pop(0)).resolve()

    if len(args) == 1:
        path = Path(args.pop(0))
    
    main(
        path=path,
        output=output,
    )
