"""
Handlers for processing different AST node types.
"""

import ast
import typing as t
from pathlib import Path
import shutil
import os
import inspect
import importlib.util
import sys
import types

from .mdx_formatter import MDX
from .parsers import parse_function, extract_imports, find_imported_references


def get_clean_file_path(file_path: str) -> str:
    """Get a clean file path for display in documentation.
    
    This uses a simple approach to normalize the path for display.
    """
    if not file_path:
        return "unknown location"

    try:
        # Convert to Path object
        path = Path(file_path)
        
        # Just use the last 3 parts of the path to provide enough context
        # This gives us something like "composio/module/file.py"
        if len(path.parts) >= 3:
            return str(Path(*path.parts[-3:]))
        # Or if it's shorter, just use what we have
        return str(path)
        
    except Exception as e:
        print(f"Error in get_clean_file_path: {e}")
        return Path(file_path).name


def get_module_from_file(file_path: Path) -> t.Optional[t.Any]:
    """Import a module from file path.
    
    This function attempts to import the module in a way that works regardless
    of whether the package is installed or being run from source.
    """
    if not file_path.exists():
        return None
        
    try:
        # Approach 1: Use importlib.util (most reliable but can fail in some environments)
        module_name = file_path.stem
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            return module
    except Exception as e:
        print(f"Warning: Could not import {file_path} using importlib.util: {e}")
        
    # If we get here, the first approach failed - let's try a simpler approach
    try:
        # Create a mock module with just the AST information
        # This doesn't execute the code but provides a minimal module object
        mock_module = types.ModuleType(file_path.stem)
        mock_module.__file__ = str(file_path)
        
        # This provides basic functionality without needing the package to be installed
        return mock_module
    except Exception as e:
        print(f"Warning: Could not create mock module for {file_path}: {e}")
        
    return None


def handle_constant(node: ast.Assign, doc: ast.Expr) -> str:
    """Handle constant."""
    if len(node.targets) != 1:
        return ""
    (target,) = node.targets
    
    # Handle different target types
    if isinstance(target, ast.Name):
        target_name = target.id
    else:
        return ""
    
    # Handle different doc value types    
    if (isinstance(doc.value, ast.Constant) and 
        isinstance(doc.value.value, str)):
        doc_value = doc.value.value.lstrip().rstrip()
    else:
        doc_value = "No description provided"
    
    return f"""
## `{target_name}`

{doc_value}

| | |
|---|---|
|value|`{ast.unparse(node.value)}`|
"""


def handle_function(node: ast.FunctionDef, file_path: t.Optional[Path] = None) -> str:
    """Handle function definition."""
    module = get_module_from_file(file_path) if file_path else None
    funcdef = parse_function(node=node, module=module)
    
    content = f"\n## `{node.name}`\n\n"
    content += f"{funcdef['description']}\n\n"
    
    # Add parameters table if there are parameters
    if funcdef["args"]:
        content += "**Parameters**\n\n"
        for arg in funcdef["args"]:
            required = arg.get("required", False)
            default = arg.get("default", None)
            param_type = arg.get("type", "unknown")
            param_name = arg.get("name", "")
            param_desc = arg.get("description", "")
            
            if default and default != "None" and default != "":
                content += MDX.as_param(name=param_name, typ=param_type, doc=param_desc, required=required, default=default)
            else:
                content += MDX.as_param(name=param_name, typ=param_type, doc=param_desc, required=required)
        content += "\n"
    
    # Add returns table if there's a return value
    if funcdef["returns"] and funcdef["returns"]["type"] != "None":
        content += "**Returns**\n\n"
        return_type = funcdef["returns"]["type"]
        return_desc = funcdef["returns"]["description"]
        content += MDX.as_response(name="returns", typ=return_type, doc=return_desc)
        content += "\n"
    
    # Add references to other Composio objects if any
    if funcdef["references"]:
        content += "**References**\n\n"
        ref_links = []
        for ref in funcdef["references"]:
            ref_links.append(f"- {MDX.as_relative_link(ref['name'], ref['path'])}")
        content += "\n".join(ref_links)
        content += "\n\n"
    
    # Add source code in accordion if available
    if funcdef["source_code"]:
        source_file = get_clean_file_path(funcdef["file_path"]) if funcdef["file_path"] else "unknown location"
        source_code = funcdef["source_code"]
        accordion_title = f"src in `{source_file}`"
        accordion_content = MDX.as_code_block(source_code)
        content += MDX.as_accordion(accordion_title, accordion_content)
    
    return content


def handle_class_function(node: ast.FunctionDef, file_path: t.Optional[Path] = None) -> str:
    """Handle class function definition."""
    module = get_module_from_file(file_path) if file_path else None
    funcdef = parse_function(node=node, module=module)
    
    content = f"\n### `def {node.name}`\n\n"
    content += f"{funcdef['description']}\n\n"
    
    # Add parameters table if there are parameters
    if funcdef["args"]:
        content += "**Parameters**\n\n"
        for arg in funcdef["args"]:
            required = arg.get("required", False)
            default = arg.get("default", None)
            param_type = arg.get("type", "unknown")
            param_name = arg.get("name", "")
            param_desc = arg.get("description", "")
            
            if default and default != "None" and default != "":
                content += MDX.as_param(name=param_name, typ=param_type, doc=param_desc, required=required, default=default)
            else:
                content += MDX.as_param(name=param_name, typ=param_type, doc=param_desc, required=required)
        content += "\n"
    
    # Add returns table if there's a return value
    if funcdef["returns"] and funcdef["returns"]["type"] != "None":
        content += "**Returns**\n\n"
        return_type = funcdef["returns"]["type"]
        return_desc = funcdef["returns"]["description"]
        content += MDX.as_response(name="returns", typ=return_type, doc=return_desc)
        content += "\n"
    
    # Add references to other Composio objects if any
    if funcdef["references"]:
        content += "**References**\n\n"
        ref_links = []
        for ref in funcdef["references"]:
            ref_links.append(f"- {MDX.as_relative_link(ref['name'], ref['path'])}")
        content += "\n".join(ref_links)
        content += "\n\n"
    
    # Add source code in accordion if available
    if funcdef["source_code"]:
        source_file = get_clean_file_path(funcdef["file_path"]) if funcdef["file_path"] else "unknown location"
        source_code = funcdef["source_code"]
        accordion_title = f"src in `{source_file}`"
        accordion_content = MDX.as_code_block(source_code)
        content += MDX.as_accordion(accordion_title, accordion_content)
    
    return content


def handle_class(node: ast.ClassDef, file_path: t.Optional[Path] = None) -> str:
    """Handler class."""
    content = f"## `class {node.name}`\n\n"
    if node.body and isinstance(node.body[0], ast.Expr):
        body_node = node.body[0]
        if isinstance(body_node.value, ast.Constant) and isinstance(body_node.value.value, str):
            docstring = body_node.value.value
            content += f"{docstring.lstrip().rstrip()}\n\n"
        else:
            content += "No description provided\n\n"
    else:
        content += "No description provided\n\n"

    # Add class methods
    functions = ""
    properties = []
    for child in node.body:
        if isinstance(child, ast.AnnAssign):
            # Add property to list
            properties.append({
                "name": ast.unparse(child.target),
                "type": ast.unparse(child.annotation),
                "description": "Class property"
            })

        if isinstance(child, ast.FunctionDef):
            # Skip functions that start with underscore (private methods)
            if child.name.startswith('_'):
                continue
            functions += handle_class_function(node=child, file_path=file_path)

    # Add properties table if there are properties
    if properties:
        content += "**Properties**\n\n"
        for prop in properties:
            prop_name = prop.get("name", "")
            prop_type = prop.get("type", "unknown")
            prop_desc = prop.get("description", "")
            content += MDX.as_param(name=prop_name, typ=prop_type, doc=prop_desc)
        content += "\n"
        
    # Add methods
    if functions:
        content += "**Methods**\n\n"
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


def handle_file(file: Path, output: Path) -> t.Optional[str]:
    """Handle file."""
    # Skip files that start with underscore (private files)
    if file.name.startswith('_') and file.name != "__init__.py":
        return None
        
    if not file.name.endswith(".py"):
        return None
    
    try:
        parsed_body = ast.parse(source=file.read_text(encoding="utf-8")).body
        if not parsed_body:
            # Empty file, create basic content
            content = MDX.as_title(content=file.name.replace(".py", ""))
            content += "\n"
        else:
            header, *body = parsed_body
            try:
                if isinstance(header, ast.Expr) and isinstance(header.value, ast.Constant):
                    content = handle_header(
                        header=header.value.value
                    )
                else:
                    content = MDX.as_title(content=file.name.replace(".py", ""))
            except Exception:
                content = MDX.as_title(content=file.name.replace(".py", ""))
            content += "\n"

            # Filter private nodes (starting with underscore)
            filtered_body = []
            for node in body:
                if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name.startswith('_'):
                    continue
                filtered_body.append(node)
            body = filtered_body

            while len(body) > 0:
                node = body.pop(0)
                if (
                    isinstance(node, ast.Assign)
                    and len(body) > 0
                    and isinstance(body[0], ast.Expr)
                ):
                    try:
                        next_node = body.pop(0)
                        if isinstance(next_node, ast.Expr):
                            # Skip private constants (those assigned to variables starting with _)
                            if (isinstance(node.targets[0], ast.Name) and 
                                node.targets[0].id.startswith('_')):
                                continue
                            content += handle_constant(
                                node=node,
                                doc=next_node,
                            )
                    except Exception:
                        pass
                    continue

                if isinstance(node, ast.FunctionDef):
                    try:
                        # Skip private functions (starting with _)
                        if node.name.startswith('_'):
                            continue
                        content += handle_function(node=node, file_path=file)
                    except Exception as e:
                        print(f"Error processing function {node.name}: {e}")
                    continue

                if isinstance(node, ast.ClassDef):
                    try:
                        # Skip private classes (starting with _)
                        if node.name.startswith('_'):
                            continue
                        content += handle_class(node=node, file_path=file)
                    except Exception as e:
                        print(f"Error processing class {node.name}: {e}")
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
            
        # Use the fern/sdk path prefix for the collection
        return str(
            Path("fern/sdk") / Path(*file.parent.parts[composio_index:]) / filename.replace(".mdx", "")
        )
        
    except Exception as e:
        print(f"Error processing file {file}: {e}")
        return None


def handle_dir(directory: Path, output: Path) -> t.Dict[str, t.Any]:
    """Handle directory."""
    # Skip directories that start with underscore (private directories)
    if directory.name.startswith('_') and directory.name != "__pycache__":
        return {"title": directory.name, "pages": []}
    
    dir_content = {
        "title": directory.name,
        "pages": [],
    }

    # First handle __init__.py if it exists
    init_file = directory / "__init__.py"
    if init_file.exists():
        try:
            page = handle_file(file=init_file, output=output)
            if page is not None:
                dir_content["pages"].append(page)
        except Exception as e:
            print(f"Error processing __init__.py: {e}")

    # Then handle subdirectories
    for subdir in directory.glob("**/"):
        if subdir == directory:
            continue
            
        # Skip directories that start with underscore (private directories)
        if subdir.name.startswith('_') and subdir.name != "__pycache__":
            continue
            
        try:
            subdir_content = handle_dir(directory=subdir, output=output)
            if subdir_content is not None and len(subdir_content.get("pages", [])) > 0:
                dir_content["pages"].append(subdir_content)
        except Exception as e:
            print(f"Error processing directory {subdir}: {e}")

    # Then handle files
    for file in directory.glob("*.py"):
        if file.name == "__init__.py":
            continue
            
        # Skip files that start with underscore (private files)
        if file.name.startswith('_'):
            continue
            
        try:
            page = handle_file(file=file, output=output)
            if page is not None:
                dir_content["pages"].append(page)
        except Exception as e:
            print(f"Error processing file {file}: {e}")

    return dir_content 