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
    # Check if docstring is actually a string
    if not isinstance(docstring, str):
        return {
            "description": "No description provided",
            "params": {},
            "raises": {},
            "return": "",
        }
        
    lines = list(filter(lambda x: x, [line.lstrip().rstrip() for line in docstring.split("\n")]))
    if not lines:
        return {
            "description": "No description provided",
            "params": {},
            "raises": {},
            "return": "",
        }
        
    description = lines.pop(0)
    docmeta = {
        "description": description,
        "params": {},
        "raises": {},
        "return": "",
    }
    while len(lines) > 0:
        line = lines.pop(0)
        if line.startswith(":param"):
            parts = line.replace(":param ", "").split(": ", 1)
            if len(parts) == 2:
                name, doc = parts
                docmeta["params"][name] = doc
            continue
        if line.startswith(":return"):
            docmeta["return"] = line.replace(":return:", "")
            continue
    return docmeta


def parse_function(node: ast.FunctionDef) -> FuctionMetadata:
    """Parse a function."""
    if not node.body:
        docmeta = {
            "description": "No description provided",
            "params": {},
            "raises": {},
            "return": "No description provided",
        }
    else:
        docstring = node.body[0]
        if isinstance(docstring, ast.Expr) and hasattr(docstring.value, 'value'):
            try:
                docmeta = parse_docstring(docstring=docstring.value.value)
            except Exception:
                docmeta = {
                    "description": "No description provided",
                    "params": {},
                    "raises": {},
                    "return": "No description provided",
                }
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

    try:
        return_type = ast.unparse(node.returns) if node.returns else "None"
    except Exception:
        return_type = "None"
        
    returns = FunctionParam(
        name="returns",
        type=return_type,
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
    if node.body and isinstance(node.body[0], ast.Expr) and hasattr(node.body[0].value, 'value'):
        try:
            docstring = t.cast(ast.Expr, node.body[0]).value.value
            if isinstance(docstring, str):
                content += MDX.as_card(docstring.lstrip().rstrip())
            else:
                content += MDX.as_card("No description provided")
        except Exception:
            content += MDX.as_card("No description provided")

    functions = ""
    properties = ""
    for child in node.body:
        if isinstance(child, ast.AnnAssign):
            content += f"""* `property` {ast.unparse(child.target)}: {ast.unparse(child.annotation)}\n"""

        if isinstance(child, ast.FunctionDef):
            functions += "\n" + handle_class_function(node=child)

    # Make sure we don't have an empty content string before removing the last character
    if content.endswith('\n'):
        content = content[:-1]
        
    if properties:
        content += MDX.as_card(properties)

    if functions:
        content += functions

    content += "\n---\n"
    return content


def handle_header(header: str) -> str:
    """Handle header."""
    if not isinstance(header, str):
        return MDX.as_title(content="No title provided")
    
    header = header.lstrip().rstrip()
    if not header:
        return MDX.as_title(content="No title provided")
        
    parts = header.split("\n")
    if not parts:
        return MDX.as_title(content="No title provided")
        
    title = parts[0]
    return MDX.as_title(content=title)


def handle_file(file: Path, output: Path) -> None:
    """Handle file."""
    if not file.name.endswith(".py"):
        return
    
    try:
        parsed_body = ast.parse(source=file.read_text(encoding="utf-8")).body
        if not parsed_body:
            # Empty file, create basic content
            content = MDX.as_title(content=file.name.replace(".py", ""))
            content += "\n"
        else:
            header, *body = parsed_body
            try:
                if isinstance(header, ast.Expr) and hasattr(header.value, 'value'):
                    content = handle_header(
                        header=header.value.value
                    )
                else:
                    content = MDX.as_title(content=file.name.replace(".py", ""))
            except Exception:
                content = MDX.as_title(content=file.name.replace(".py", ""))
            content += "\n"

            while len(body) > 0:
                node = body.pop(0)
                if (
                    isinstance(node, ast.Assign)
                    and len(body) > 0
                    and isinstance(body[0], ast.Expr)
                ):
                    try:
                        content += handle_constant(
                            node=node,
                            doc=body.pop(0),
                        )
                    except Exception:
                        pass
                    continue

                if isinstance(node, ast.FunctionDef):
                    try:
                        content += handle_function(node=node)
                    except Exception:
                        pass
                    continue

                if isinstance(node, ast.ClassDef):
                    try:
                        content += handle_class(node=node)
                    except Exception:
                        pass
                    continue

        # Create the output directory path
        try:
            composio_index = file.parent.parts.index("composio") + 1
        except ValueError:
            # If "composio" not in path, use the last directory
            composio_index = -1
            
        outdir = output / Path(
            *file.parent.parts[composio_index:]
        )
        outdir.mkdir(exist_ok=True, parents=True)
        filename = (
            "index.mdx" if file.name == "__init__.py" else file.name.replace(".py", ".mdx")
        )
        (outdir / filename).write_text(content, encoding="utf-8")
        
        # Return the path for inclusion in the collection
        try:
            composio_index = file.parent.parts.index("composio") + 1
        except ValueError:
            composio_index = -1
            
        return str(
            "sdk"
            / Path(*file.parent.parts[composio_index:])
            / filename.replace(".mdx", "")
        )
        
    except Exception as e:
        print(f"Error processing file {file}: {e}")
        return None


def handle_dir(directory: Path, output: Path) -> t.Dict[str, t.Any]:
    """Handle directory."""
    if directory.name == "__pycache__":
        return {"group": "__pycache__", "pages": []}
        
    collection = {
        "group": directory.name.title(),
        "pages": [],
    }
    
    try:
        for path in directory.iterdir():
            try:
                if path.is_file():
                    page = handle_file(file=path, output=output)
                else:
                    page = handle_dir(directory=path, output=output)
                    
                if page is not None:
                    collection["pages"].append(page)
            except Exception as e:
                print(f"Error processing {path}: {e}")
    except Exception as e:
        print(f"Error iterating directory {directory}: {e}")
        
    return collection


def main(
    path: t.Optional[Path] = None,
    output: t.Optional[Path] = None,
) -> None:
    """Run documentation generator."""
    try:
        # Setup output directory
        output = output or Path.cwd() / "sdk" / "composio"
        if output.exists():
            shutil.rmtree(output)
        output.mkdir(parents=True, exist_ok=True)

        # Set path and change directory
        path = path or Path.cwd() / "composio" / "composio"
        if not path.exists():
            print(f"Path {path} does not exist!")
            return
            
        # Store original directory to return to it later
        original_dir = os.getcwd()
        
        try:
            os.chdir(path.parent)
            print(f"Changed directory to: {os.getcwd()}")
            
            collection = {
                "group": "Reference",
                "pages": [],
            }
            
            for include in INCLUDE:
                include_path = path / include
                if not include_path.exists():
                    print(f"Included path {include_path} does not exist, skipping...")
                    continue
                    
                try:
                    if include_path.is_file():
                        page = handle_file(file=include_path, output=output)
                    else:
                        page = handle_dir(directory=include_path, output=output)
                        
                    if page is not None:
                        collection["pages"].append(page)
                except Exception as e:
                    print(f"Error processing include {include}: {e}")
                    
            # Filter out None values from pages
            collection["pages"] = [p for p in collection["pages"] if p is not None]
            
            # Output the collection for mint.json
            print(f"Add following config to `mint.json`\n{json.dumps(collection, indent=2)}")
            
        finally:
            # Return to original directory
            os.chdir(original_dir)
            
    except Exception as e:
        print(f"An error occurred in main: {e}")


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
