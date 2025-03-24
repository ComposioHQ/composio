"""
Parsers for extracting documentation from Python AST.
"""

import ast
import typing as t
from typing_extensions import TypedDict, Optional
from pathlib import Path
import importlib
import types
import inspect
import re
import sys


def import_file(file: Path) -> types.ModuleType:
    """Import file as module."""
    path = ".".join(
        [*file.relative_to(Path.cwd()).parent.parts, file.name.removesuffix(".py")]
    )
    return importlib.import_module(name=path)


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


def extract_imports(node: ast.Module) -> t.List[t.Dict[str, str]]:
    """Extract all imports from a module.
    
    :param node: AST module node
    :return: List of dictionaries with import information
    """
    imports = []
    for item in node.body:
        if isinstance(item, ast.Import):
            for name in item.names:
                imports.append({
                    "module": name.name,
                    "asname": name.asname or name.name,
                    "from_module": None,
                })
        elif isinstance(item, ast.ImportFrom):
            if item.module and item.module.startswith("composio"):
                for name in item.names:
                    imports.append({
                        "module": item.module,
                        "name": name.name,
                        "asname": name.asname or name.name,
                        "from_module": item.module,
                    })
    return imports


def find_imported_references(content: str, imports: t.List[t.Dict[str, str]]) -> t.List[t.Dict[str, str]]:
    """Find references to imported composio elements.
    
    :param content: Source code content
    :param imports: List of import dictionaries
    :return: List of reference dictionaries
    """
    references = []
    
    for imp in imports:
        # Skip non-composio imports
        if "module" not in imp or not imp["module"].startswith("composio"):
            continue
            
        # Handle different import types
        if "name" in imp:
            # from composio.x import y
            pattern = r'\b' + re.escape(imp["asname"]) + r'\b'
            if re.search(pattern, content):
                path = "/".join(imp["module"].split("."))
                references.append({
                    "name": imp["name"],
                    "asname": imp["asname"],
                    "path": f"{path}/{imp['name']}",
                    "module": imp["module"],
                })
        else:
            # import composio.x
            pattern = r'\b' + re.escape(imp["asname"]) + r'\.'
            matches = re.findall(pattern + r'([a-zA-Z0-9_]+)', content)
            if matches:
                path = "/".join(imp["module"].split("."))
                for match in set(matches):
                    references.append({
                        "name": match,
                        "path": f"{path}/{match}",
                        "module": imp["module"],
                    })
    
    return references


def get_source_code(obj: t.Any) -> t.Optional[str]:
    """Get the source code for an object using the inspect module.
    
    :param obj: Object to get source code for
    :return: Source code string or None if not available
    """
    try:
        return inspect.getsource(obj)
    except (TypeError, OSError):
        return None


class FunctionParam(TypedDict):
    """Function parameter metadata."""

    name: str
    type: str
    required: bool
    description: str
    default: t.Optional[str]


class FuctionMetadata(TypedDict):
    """Function metadata."""

    name: str
    args: t.List[FunctionParam]
    returns: FunctionParam
    description: str
    source_code: t.Optional[str]
    file_path: t.Optional[str]
    module_path: t.Optional[str]
    references: t.List[t.Dict[str, str]]


def parse_function(node: ast.FunctionDef, module: t.Optional[types.ModuleType] = None) -> FuctionMetadata:
    """Parse a function."""
    source_code = None
    file_path = None
    module_path = None
    references = []
    
    # Try to get source code and file path using inspect if module is provided
    if module:
        try:
            func = getattr(module, node.name, None)
            if func:
                source_code = get_source_code(func)
                file_path = inspect.getfile(func)
                module_path = module.__name__
                
                # Find imports in the module
                imports = extract_imports(ast.parse(inspect.getsource(module)))
                
                # Find references to imported composio elements
                if source_code:
                    references = find_imported_references(source_code, imports)
        except (AttributeError, TypeError):
            pass
    
    # If source_code is still None, extract it directly from the AST node
    if source_code is None:
        try:
            source_code = ast.unparse(node)
            # If file_path is None and we have a module with __file__, use that
            if file_path is None and module and hasattr(module, "__file__"):
                file_path = module.__file__
                module_path = module.__name__
            # If we have a file_path from the function context
            elif file_path is None and isinstance(node, ast.FunctionDef) and hasattr(node, "lineno"):
                # Use the context from the node to determine file location
                if isinstance(module, types.ModuleType) and hasattr(module, "__file__"):
                    file_path = module.__file__
        except Exception as e:
            print(f"Error extracting source code: {e}")
    
    # If file_path is still None but we got a module, use its file path
    if file_path is None and module and hasattr(module, "__file__"):
        try:
            file_path = str(module.__file__)
        except Exception:
            pass
    
    if not node.body:
        docmeta = {
            "description": "No description provided",
            "params": {},
            "raises": {},
            "return": "No description provided",
        }
    else:
        docstring = node.body[0]
        if isinstance(docstring, ast.Expr) and isinstance(docstring.value, ast.Constant):
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
        
        # Get default value if available
        default_value = None
        if node.args.defaults:
            # Calculate the position of this argument in the defaults list
            defaults_start_idx = len(node.args.args) - len(node.args.defaults)
            arg_pos = node.args.args.index(arg)
            if arg_pos >= defaults_start_idx:
                default_idx = arg_pos - defaults_start_idx
                if default_idx < len(node.args.defaults):
                    default_value = ast.unparse(node.args.defaults[default_idx])
        
        args.append(
            FunctionParam(
                name=arg.arg,
                type=_type,
                required="Optional" not in _type and "bool" not in _type and default_value is None,
                description=docmeta["params"].get(arg.arg) or "No description provided",
                default=default_value
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
        default=None
    )

    return FuctionMetadata(
        name=node.name,
        args=args,
        returns=returns,
        description=docmeta["description"],
        source_code=source_code,
        file_path=file_path,
        module_path=module_path,
        references=references
    ) 