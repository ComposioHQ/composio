#!/usr/bin/env python3
"""
Python SDK Documentation Generator

Generates MDX documentation from Python source code using griffe.
Output is written to the docs content directory.

Run: cd python && uv run --with griffe python scripts/generate-docs.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

try:
    import griffe
except ImportError:
    print("Error: griffe not installed. Run: pip install griffe")
    raise SystemExit(1)

# Paths
SCRIPT_DIR = Path(__file__).parent
PACKAGE_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = (
    PACKAGE_DIR.parent
    / "docs"
    / "content"
    / "reference"
    / "sdk-reference"
    / "python"
)

# GitHub base URL for source links
GITHUB_BASE = "https://github.com/composiohq/composio/blob/next/python"

# Decorators to document
DECORATORS_TO_DOCUMENT = [
    ("before_execute", "composio.core.models._modifiers"),
    ("after_execute", "composio.core.models._modifiers"),
    ("schema_modifier", "composio.core.models._modifiers"),
]

# Classes to skip (internal/helper classes)
SKIP_CLASSES = {"WithLogger", "SDKConfig", "TProvider"}

# Expected classes to document (maps class name -> property name on Composio)
EXPECTED_CLASSES = {
    "Tools": "tools",
    "Toolkits": "toolkits",
    "Triggers": "triggers",
    "ConnectedAccounts": "connected_accounts",
    "AuthConfigs": "auth_configs",
}

# Modules to search for classes
CLASS_MODULES = [
    "core.models.tools",
    "core.models.toolkits",
    "core.models.triggers",
    "core.models.connected_accounts",
    "core.models.auth_configs",
]


def to_kebab_case(name: str) -> str:
    """Convert PascalCase to kebab-case."""
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1-\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1-\2", s1).lower()


def escape_yaml_string(s: str) -> str:
    """Escape a string for YAML frontmatter."""
    if any(c in s for c in [":", '"', "'", "\n", "#", "{", "}"]):
        return f'"{s.replace(chr(34), chr(92) + chr(34))}"'
    return s


def get_source_link(obj: griffe.Object) -> str | None:
    """Get GitHub source link for an object."""
    if not hasattr(obj, "filepath") or not obj.filepath:
        return None
    try:
        raw_filepath = obj.filepath
        # Handle case where filepath might be a list (griffe edge case)
        if isinstance(raw_filepath, list):
            resolved_path: Path | None = raw_filepath[0] if raw_filepath else None
        else:
            resolved_path = raw_filepath
        if not resolved_path:
            return None
        rel_path = resolved_path.relative_to(PACKAGE_DIR)
    except ValueError:
        return None
    line = obj.lineno if hasattr(obj, "lineno") and obj.lineno else 1
    return f"{GITHUB_BASE}/{rel_path}#L{line}"


def format_type(annotation: Any) -> str:
    """Format a type annotation to readable string."""
    if annotation is None:
        return "Any"

    type_str = str(annotation)
    # Clean up common prefixes
    type_str = type_str.replace("typing.", "").replace("typing_extensions.", "")
    type_str = type_str.replace("composio.client.types.", "")
    type_str = re.sub(r"\bt\.", "", type_str)
    type_str = re.sub(r"\bte\.", "", type_str)  # typing_extensions alias
    type_str = re.sub(r"Optional\[([^\]]+)\]", r"\1 | None", type_str)
    # Clean up Unpack to just show the type
    type_str = re.sub(r"Unpack\[([^\]]+)\]", r"\1", type_str)

    # Truncate very long types
    if len(type_str) > 60:
        return type_str[:57] + "..."
    return type_str


def parse_docstring(docstring: str | None) -> dict[str, Any]:
    """Parse docstring into components."""
    if not docstring:
        return {"description": "", "params": {}, "returns": None, "examples": []}

    lines = docstring.strip().split("\n")
    description_lines = []
    params: dict[str, str] = {}
    returns = None
    examples: list[str] = []

    section = "description"
    current_param = None
    example_lines: list[str] = []

    for line in lines:
        stripped = line.strip()

        # Check for :param name: description
        param_match = re.match(r":param\s+(\w+):\s*(.*)", stripped)
        if param_match:
            section = "params"
            current_param = param_match.group(1)
            params[current_param] = param_match.group(2)
            continue

        # Check for :returns: or :return:
        return_match = re.match(r":returns?:\s*(.*)", stripped)
        if return_match:
            section = "returns"
            returns = return_match.group(1)
            continue

        # Check for Example section
        if stripped.lower().startswith("example"):
            section = "examples"
            continue

        # Add to appropriate section
        if section == "description":
            description_lines.append(stripped)
        elif section == "params" and current_param and stripped:
            params[current_param] += " " + stripped
        elif section == "returns" and returns and stripped:
            returns += " " + stripped
        elif section == "examples":
            example_lines.append(line)

    if example_lines:
        examples.append("\n".join(example_lines).strip())

    return {
        "description": " ".join(description_lines).strip(),
        "params": params,
        "returns": returns,
        "examples": examples,
    }


def extract_class_info(
    cls: griffe.Class, class_name: str, config: dict
) -> dict[str, Any]:
    """Extract documentation from a class."""
    doc = parse_docstring(cls.docstring.value if cls.docstring else None)

    info = {
        "name": class_name,
        "access": config.get("access"),
        "source_link": get_source_link(cls),
        "description": doc["description"],
        "properties": [],
        "methods": [],
    }

    # Extract properties/attributes
    for name, member in cls.members.items():
        if name.startswith("_"):
            continue
        if isinstance(member, griffe.Attribute):
            attr_doc = member.docstring.value if member.docstring else ""
            info["properties"].append(
                {
                    "name": name,
                    "type": format_type(member.annotation),
                    "description": attr_doc.strip() if attr_doc else "",
                }
            )

    # Extract methods
    for name, member in cls.members.items():
        if name.startswith("_"):
            continue
        if isinstance(member, griffe.Function):
            method_doc = parse_docstring(
                member.docstring.value if member.docstring else None
            )

            params = []
            for p in member.parameters:
                if p.name in ("self", "cls"):
                    continue
                params.append(
                    {
                        "name": p.name,
                        "type": format_type(p.annotation),
                        "optional": p.default is not None,
                        "description": method_doc["params"].get(p.name, ""),
                    }
                )

            info["methods"].append(
                {
                    "name": name,
                    "source_link": get_source_link(member),
                    "description": method_doc["description"],
                    "parameters": params,
                    "return_type": format_type(member.returns),
                    "return_description": method_doc["returns"],
                    "examples": method_doc["examples"],
                }
            )

    return info


def generate_class_mdx(
    info: dict[str, Any], prop_to_class: dict[str, str] | None = None
) -> str:
    """Generate MDX for a class."""
    lines = []

    # Frontmatter
    desc = (
        info["description"].split("\n")[0]
        if info["description"]
        else f"{info['name']} class"
    )
    if len(desc) > 150:
        desc = desc[:147] + "..."

    lines.append("---")
    lines.append(f"title: {info['name']}")
    lines.append(f"description: {escape_yaml_string(desc)}")
    lines.append("---")
    lines.append("")

    source_link = info.get("source_link", "")

    # Properties - as table for Composio class
    if prop_to_class:
        prop_rows = []
        for prop in info["properties"]:
            prop_name = prop["name"]
            if prop_name in prop_to_class:
                class_name = prop_to_class[prop_name]
                link = f"/reference/sdk-reference/python/{to_kebab_case(class_name)}"
                prop_rows.append(f"| [`{prop_name}`]({link}) | `{class_name}` |")

        if prop_rows:
            lines.append("## Properties")
            lines.append("")
            lines.append("| Name | Type |")
            lines.append("|------|------|")
            lines.extend(prop_rows)
            lines.append("")

    # Methods
    if info["methods"]:
        lines.append("## Methods")
        lines.append("")

        for method in info["methods"]:
            lines.append(f"### {method['name']}()")
            lines.append("")

            if method["description"]:
                lines.append(method["description"])
                lines.append("")

            # Signature
            params_str = ", ".join(
                f"{p['name']}: {p['type']}" + (" = ..." if p["optional"] else "")
                for p in method["parameters"]
            )
            ret_type = method["return_type"] if method["return_type"] != "Any" else ""
            sig = f"def {method['name']}({params_str})"
            if ret_type:
                sig += f" -> {ret_type}"

            lines.append("```python")
            lines.append(sig)
            lines.append("```")
            lines.append("")

            # Parameters
            if method["parameters"]:
                lines.append("**Parameters**")
                lines.append("")
                lines.append("| Name | Type |")
                lines.append("|------|------|")
                for p in method["parameters"]:
                    opt = "?" if p["optional"] else ""
                    safe_type = p["type"].replace("|", "\\|")
                    lines.append(f"| `{p['name']}{opt}` | `{safe_type}` |")
                lines.append("")

            # Returns
            if method["return_type"] and method["return_type"] not in ("None", "Any"):
                ret_desc = method["return_description"] or ""
                lines.append("**Returns**")
                lines.append("")
                if ret_desc:
                    lines.append(f"`{method['return_type']}` — {ret_desc}")
                else:
                    lines.append(f"`{method['return_type']}`")
                lines.append("")

            # Examples
            if method["examples"]:
                lines.append("**Example**")
                lines.append("")
                for ex in method["examples"]:
                    lines.append("```python")
                    lines.append(ex)
                    lines.append("```")
                lines.append("")

            lines.append("---")
            lines.append("")

    # Source link at bottom
    if source_link:
        lines.append(f"[View source]({source_link})")
        lines.append("")

    return "\n".join(lines)


def generate_index_mdx(classes: list[dict], decorators: list[dict]) -> str:
    """Generate index page."""

    # Classes table
    class_rows = []
    for c in classes:
        link = f"/reference/sdk-reference/python/{to_kebab_case(c['name'])}"
        desc = (
            c["description"][:80] + "..."
            if len(c["description"]) > 80
            else c["description"]
        )
        class_rows.append(f"| [`{c['name']}`]({link}) | {desc} |")

    # Decorators section
    dec_section = ""
    if decorators:
        dec_lines = ["## Decorators", ""]
        for d in decorators:
            dec_lines.append(f"### {d['name']}")
            dec_lines.append("")
            if d["description"]:
                dec_lines.append(d["description"])
                dec_lines.append("")
            if d["source_link"]:
                dec_lines.append(f"[View source]({d['source_link']})")
                dec_lines.append("")
            # Signature
            params = ", ".join(
                f"{p['name']}: {p['type']}" + (" = ..." if p["optional"] else "")
                for p in d["parameters"]
            )
            dec_lines.append("```python")
            dec_lines.append(f"@{d['name']}({params})")
            dec_lines.append("def my_modifier(...):")
            dec_lines.append("    ...")
            dec_lines.append("```")
            dec_lines.append("")
        dec_section = "\n".join(dec_lines)

    return f"""---
title: Python SDK Reference
description: API reference for the Composio Python SDK
---

# Python SDK Reference

Complete API reference for the `composio` Python package.

## Installation

```bash
pip install composio
```

Or with uv:

```bash
uv add composio
```

## Classes

| Class | Description |
|-------|-------------|
{chr(10).join(class_rows)}

## Quick Start

```python
from composio import Composio

composio = Composio(api_key="your-api-key")

# Get tools for a user
tools = composio.tools.get("user-123", toolkits=["github"])

# Execute a tool
result = composio.tools.execute(
    "GITHUB_GET_REPOS",
    arguments={{"owner": "composio"}},
    user_id="user-123"
)
```

{dec_section}
"""


def main():
    print("Starting Python SDK documentation generation...\n")
    print(f"Output: {OUTPUT_DIR}\n")

    # Clean output
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    # Load package
    print("Loading composio package...")
    try:
        package = griffe.load("composio", search_paths=[str(PACKAGE_DIR)])
    except Exception as e:
        print(f"Error: {e}")
        raise SystemExit(1)

    # Find Composio class
    composio_cls = package.members["sdk"].members["Composio"]
    print("  Found Composio class")

    # Discover classes from EXPECTED_CLASSES
    classes_to_doc = {"Composio": {"cls": composio_cls, "access": None, "prop": None}}
    prop_to_class = {}  # Maps property name -> class name

    for module_name in CLASS_MODULES:
        try:
            parts = module_name.split(".")
            current = package
            for part in parts:
                current = current.members[part]

            # Find expected classes in this module
            for class_name, prop_name in EXPECTED_CLASSES.items():
                if class_name in current.members:
                    cls = current.members[class_name]
                    if isinstance(cls, griffe.Class):
                        classes_to_doc[class_name] = {
                            "cls": cls,
                            "access": f"composio.{prop_name}",
                            "prop": prop_name,
                        }
                        prop_to_class[prop_name] = class_name
                        print(f"  Found {class_name} (via composio.{prop_name})")
        except (KeyError, AttributeError):
            continue

    # Generate docs for each class
    documented_classes = []

    for class_name, config in classes_to_doc.items():
        cls = config["cls"]
        print(f"  Processing {class_name}...")

        info = extract_class_info(cls, class_name, {"access": config["access"]})

        # Only Composio gets prop_to_class for linking
        if class_name == "Composio":
            mdx = generate_class_mdx(info, prop_to_class)
        else:
            mdx = generate_class_mdx(info, None)

        file_path = OUTPUT_DIR / f"{to_kebab_case(class_name)}.mdx"
        file_path.write_text(mdx)

        documented_classes.append(
            {
                "name": class_name,
                "description": info["description"] or f"{class_name} class",
            }
        )

    # Process decorators
    decorators = []
    for dec_name, dec_module in DECORATORS_TO_DOCUMENT:
        module_path = dec_module.split(".")
        current = package

        for part in module_path[1:]:
            if part in current.members:
                current = current.members[part]

        if dec_name in current.members:
            func = current.members[dec_name]
            if isinstance(func, griffe.Function):
                print(f"  Processing decorator {dec_name}...")
                doc = parse_docstring(func.docstring.value if func.docstring else None)

                params = []
                for p in func.parameters:
                    if p.name in ("self", "cls"):
                        continue
                    params.append(
                        {
                            "name": p.name,
                            "type": format_type(p.annotation),
                            "optional": p.default is not None,
                            "description": doc["params"].get(p.name, ""),
                        }
                    )

                decorators.append(
                    {
                        "name": dec_name,
                        "source_link": get_source_link(func),
                        "description": doc["description"],
                        "parameters": params,
                    }
                )

    # Generate index
    index_content = generate_index_mdx(documented_classes, decorators)
    (OUTPUT_DIR / "index.mdx").write_text(index_content)

    # Generate meta.json
    meta = {
        "title": "Python SDK",
        "pages": [to_kebab_case(c["name"]) for c in documented_classes],
    }
    (OUTPUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"\nDone! Generated {len(documented_classes)} class docs + index")
    print(f"  Classes: {', '.join(c['name'] for c in documented_classes)}")
    print(f"  Decorators: {', '.join(d['name'] for d in decorators)}")


if __name__ == "__main__":
    main()
