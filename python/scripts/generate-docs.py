#!/usr/bin/env python3
"""
Python SDK Documentation Generator

Generates MDX documentation from Python source code using griffe.
Output is written to the docs content directory.

Run: cd python && uv run --with griffe python scripts/generate-docs.py
"""

from __future__ import annotations

import ast
import inspect
import json
import re
import shutil
import textwrap
from pathlib import Path
from typing import Any

import typing as t

if t.TYPE_CHECKING:
    import griffe as griffe_t

_griffe: Any | None = None


def load_griffe() -> Any:
    """Load griffe lazily so parser helpers can be unit-tested without it."""
    global _griffe
    if _griffe is None:
        try:
            import griffe as griffe_module
        except ImportError:
            print("Error: griffe not installed. Run: pip install griffe")
            raise SystemExit(1)
        _griffe = griffe_module
    return _griffe


# Paths
SCRIPT_DIR = Path(__file__).parent
PACKAGE_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = (
    PACKAGE_DIR.parent / "docs" / "content" / "reference" / "sdk-reference" / "python"
)

# GitHub base URL for source links
GITHUB_BASE = "https://github.com/composiohq/composio/blob/next/python"

# Decorators to document
DECORATORS_TO_DOCUMENT = [
    ("before_execute", "composio.core.models._modifiers"),
    ("after_execute", "composio.core.models._modifiers"),
    ("before_file_upload", "composio.core.models._modifiers"),
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
    "MCP": "mcp",
}

# Additional public-facing classes worth documenting even though they are not
# exposed as direct properties on ``Composio``.
#
# ``SessionContextImpl`` is intentionally omitted: it is an internal
# implementation detail handed to custom-tool execute functions as a
# ``SessionContext`` instance, never referenced directly, so it must not
# appear in the public SDK reference.
ADDITIONAL_CLASSES = {
    "ToolRouterSession": "core.models.tool_router_session",
}

# Modules to search for classes
CLASS_MODULES = [
    "core.models.tools",
    "core.models.toolkits",
    "core.models.triggers",
    "core.models.connected_accounts",
    "core.models.auth_configs",
    "core.models.mcp",
]

# Pure-docs presentation overrides. The public class name ``ToolRouterSession``
# is kept in source (renaming is a breaking change), but the SDK reference
# presents the session object under the canonical "Session" naming.
DISPLAY_NAME_OVERRIDES = {
    "ToolRouterSession": "Session",
}

SLUG_OVERRIDES = {
    "ToolRouterSession": "session",
}


def to_kebab_case(name: str) -> str:
    """Convert PascalCase to kebab-case."""
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1-\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1-\2", s1).lower()


def display_name_for(class_name: str) -> str:
    """Resolve the display title for a class (falls back to the class name)."""
    return DISPLAY_NAME_OVERRIDES.get(class_name, class_name)


def slug_for(class_name: str) -> str:
    """Resolve the URL slug / filename stem (falls back to kebab-case)."""
    return SLUG_OVERRIDES.get(class_name, to_kebab_case(class_name))


def escape_yaml_string(s: str) -> str:
    """Escape a string for YAML frontmatter."""
    return json.dumps(s)


def get_source_link(obj: griffe_t.Object) -> str | None:
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


def format_type(annotation: Any, *, max_length: int | None = 60) -> str:
    """Format a type annotation to readable string.

    Types longer than ``max_length`` are elided; pass ``None`` to keep the
    full type, which parameter signatures need so quoted forward references
    such as ``'Omit'`` are never cut mid-token.
    """
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
    if max_length is not None and len(type_str) > max_length:
        return type_str[: max_length - 3] + "..."
    return type_str


def _render_rst_role(match: re.Match[str]) -> str:
    """Render an reST role match as inline code, honoring ``~`` short names."""
    target = match.group(1)
    if target.startswith("~"):
        target = target.rsplit(".", 1)[-1]
    return f"`{target}`"


def normalize_inline_rst(text: str) -> str:
    """Normalize inline reStructuredText markup to MDX-friendly markdown.

    Converts reST roles such as ``:class:`Foo` `` into plain inline code and
    reST double-backtick literals (``name``) into single-backtick inline code
    so generated prose renders correctly on the docs site. A ``~`` role prefix
    (``:class:`~mod.Foo` ``) renders as the short target name, matching Sphinx.
    """
    if not text:
        return text
    # ReST roles: :class:`X`, :func:`mod.func`, :meth:`X.y`, :mod:`~pkg.mod`,
    # ... A leading ``~`` requests the short target name, so drop the path.
    normalized = re.sub(r":[a-zA-Z]+:`([^`]+)`", _render_rst_role, text)
    # ReST double-backtick literals: ``name`` -> `name`
    return re.sub(r"``([^`]+)``", r"`\1`", normalized)


def parse_docstring(docstring: str | None) -> dict[str, Any]:
    """Parse docstring into components."""
    if not docstring:
        return {
            "description": "",
            "params": {},
            "returns": None,
            "examples": [],
            "raises": [],
            "deprecated": None,
        }

    lines = docstring.strip().split("\n")
    description_lines = []
    params: dict[str, str] = {}
    returns = None
    examples: list[str] = []
    raises: list[dict[str, str]] = []
    deprecated_lines: list[str] = []

    section = "description"
    current_param = None
    current_raise: dict[str, str] | None = None
    example_lines: list[str] = []

    for line in lines:
        stripped = line.strip()

        # Check for a ``.. deprecated::`` directive (reStructuredText).
        if re.match(r"\.\.\s+deprecated::", stripped):
            section = "deprecated"
            rest = re.sub(r"\.\.\s+deprecated::\s*", "", stripped).strip()
            if rest:
                deprecated_lines.append(rest)
            continue

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

        # Check for :raises Exc: description (plus common Sphinx synonyms).
        raise_match = re.match(
            r":(?:raises?|except|throws?)\s+([\w.]+):\s*(.*)", stripped
        )
        if raise_match:
            section = "raises"
            current_raise = {
                "exception": raise_match.group(1),
                "description": raise_match.group(2).strip(),
            }
            raises.append(current_raise)
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
        elif section == "raises" and current_raise is not None and stripped:
            current_raise["description"] = (
                current_raise["description"] + " " + stripped
            ).strip()
        elif section == "examples":
            example_lines.append(line)
        elif section == "deprecated" and stripped:
            deprecated_lines.append(stripped)

    if example_lines:
        examples.append(normalize_example("\n".join(example_lines)))

    return {
        "description": normalize_inline_rst(" ".join(description_lines).strip()),
        "params": {name: normalize_inline_rst(desc) for name, desc in params.items()},
        "returns": normalize_inline_rst(returns) if returns else None,
        "examples": examples,
        "raises": [
            {
                "exception": entry["exception"],
                "description": normalize_inline_rst(entry["description"]),
            }
            for entry in raises
        ],
        "deprecated": (
            normalize_inline_rst(" ".join(deprecated_lines).strip())
            if deprecated_lines
            else None
        ),
    }


def normalize_example(example: str) -> str:
    """Normalize a docstring example before wrapping it in an MDX code fence."""
    normalized = textwrap.dedent(example).strip()
    lines = normalized.splitlines()

    if len(lines) >= 2 and lines[0].strip().startswith("```"):
        closing_index = len(lines) - 1
        if lines[closing_index].strip() == "```":
            normalized = "\n".join(lines[1:closing_index]).strip()

    return normalized


def extract_class_info(
    cls: griffe_t.Class, class_name: str, config: dict
) -> dict[str, Any]:
    """Extract documentation from a class."""
    griffe_module = load_griffe()
    doc = parse_docstring(cls.docstring.value if cls.docstring else None)

    info = {
        "name": class_name,
        "access": config.get("access"),
        "source_link": get_source_link(cls),
        "description": doc["description"],
        "deprecated": doc.get("deprecated"),
        "properties": [],
        "methods": [],
    }

    # Extract properties/attributes
    for name, member in cls.members.items():
        if name.startswith("_"):
            continue
        if isinstance(member, griffe_module.Attribute):
            attr_doc = member.docstring.value if member.docstring else ""
            info["properties"].append(
                {
                    "name": name,
                    "type": format_type(member.annotation),
                    "description": (
                        normalize_inline_rst(attr_doc.strip()) if attr_doc else ""
                    ),
                }
            )

    # Extract methods
    for name, member in cls.members.items():
        if name.startswith("_"):
            continue
        if isinstance(member, griffe_module.Function):
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
                        "type": format_type(p.annotation, max_length=None),
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
                    "raises": method_doc["raises"],
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
    lines.append(f"title: {escape_yaml_string(display_name_for(info['name']))}")
    lines.append(f"description: {escape_yaml_string(desc)}")
    lines.append("---")
    lines.append("")
    if info["name"] == "ToolRouterSession":
        lines.extend(
            [
                "See [Session results](/reference/sdk-reference/python/session-results) "
                "for exact search and execution schemas, imports, and serialization.",
                "",
            ]
        )

    # Class-level deprecation callout (rendered as a fumadocs warning callout).
    deprecated_note = info.get("deprecated")
    if deprecated_note:
        lines.append('<Callout type="warn" title="Deprecated">')
        lines.append(deprecated_note)
        lines.append("</Callout>")
        lines.append("")

    source_link = info.get("source_link", "")

    # Properties
    property_rows = []
    if info["properties"]:
        if prop_to_class:
            for prop in info["properties"]:
                prop_name = prop["name"]
                if prop_name in prop_to_class:
                    class_name = prop_to_class[prop_name]
                    link = (
                        f"/reference/sdk-reference/python/{to_kebab_case(class_name)}"
                    )
                    property_rows.append(
                        {
                            "name": f"[`{prop_name}`]({link})",
                            "type": f"`{class_name}`",
                            "description": prop["description"],
                        }
                    )
        elif info["name"] in ADDITIONAL_CLASSES:
            for prop in info["properties"]:
                property_rows.append(
                    {
                        "name": f"`{prop['name']}`",
                        "type": f"`{prop['type']}`",
                        "description": prop["description"],
                    }
                )

    if property_rows:
        include_descriptions = any(row["description"] for row in property_rows)
        lines.append("## Properties")
        lines.append("")
        if include_descriptions:
            lines.append("| Name | Type | Description |")
            lines.append("|------|------|-------------|")
            for row in property_rows:
                lines.append(
                    f"| {row['name']} | {row['type']} | {row['description']} |"
                )
        else:
            lines.append("| Name | Type |")
            lines.append("|------|------|")
            for row in property_rows:
                lines.append(f"| {row['name']} | {row['type']} |")
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

            # Raises
            raises = method.get("raises") or []
            if raises:
                lines.append("**Raises**")
                lines.append("")
                for entry in raises:
                    exc_desc = entry["description"]
                    if exc_desc:
                        lines.append(f"- `{entry['exception']}` — {exc_desc}")
                    else:
                        lines.append(f"- `{entry['exception']}`")
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
        link = f"/reference/sdk-reference/python/{slug_for(c['name'])}"
        desc = (
            c["description"][:80] + "..."
            if len(c["description"]) > 80
            else c["description"]
        )
        class_rows.append(f"| [`{display_name_for(c['name'])}`]({link}) | {desc} |")

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
title: {escape_yaml_string("Python SDK Reference")}
description: {escape_yaml_string("API reference for the Composio Python SDK")}
---

# Python SDK Reference

Complete API reference for the `composio` Python package.

## Installation

<PackageInstall ecosystem="python" packages="composio" />

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


def session_result_schemas() -> dict[str, dict[str, Any]]:
    """Use the installed client's actual models, not a second response schema."""
    from pydantic import TypeAdapter

    from composio.core.models.tool_router_session import (
        ToolRouterInputResponse,
        ToolRouterSessionExecuteResponse,
        ToolRouterSessionProxyExecuteResponse,
        ToolRouterSessionSearchResponse,
    )

    return {
        name: TypeAdapter(model).json_schema(by_alias=False)
        for name, model in {
            "ToolRouterSessionExecuteResponse": ToolRouterSessionExecuteResponse,
            "ToolRouterSessionSearchResponse": ToolRouterSessionSearchResponse,
            "ToolRouterSessionProxyExecuteResponse": ToolRouterSessionProxyExecuteResponse,
            "ToolRouterInputResponse": ToolRouterInputResponse,
        }.items()
    }


def session_method_signature(method: Any) -> str:
    """Preserve keyword-only markers, annotations, and defaults from source."""
    node = ast.parse(textwrap.dedent(inspect.getsource(method))).body[0]
    if not isinstance(node, ast.FunctionDef) or node.returns is None:
        raise ValueError("Session methods must have explicit return annotations")
    node.args.args = [arg for arg in node.args.args if arg.arg != "self"]
    return (
        f"def {node.name}({ast.unparse(node.args)}) -> {ast.unparse(node.returns)}: ..."
    )


def render_schema_tables(schema: dict[str, Any]) -> str:
    """Render nested properties and model references without duplicating shapes."""

    def field_type(field: dict[str, Any]) -> str:
        if "$ref" in field:
            return field["$ref"].rsplit("/", 1)[-1]
        for union in ("anyOf", "oneOf"):
            if union in field:
                return " | ".join(field_type(part) for part in field[union])
        if "enum" in field:
            return " | ".join(json.dumps(value) for value in field["enum"])
        if "const" in field:
            return json.dumps(field["const"])
        kind = field.get("type", "Any")
        if kind == "array":
            return f"list[{field_type(field.get('items', {}))}]"
        if kind == "object" and "properties" not in field:
            extra = field.get("additionalProperties", True)
            value = field_type(extra) if isinstance(extra, dict) else "Any"
            return f"dict[str, {value}]"
        return str(kind)

    def rows(obj: dict[str, Any], prefix: str = "") -> list[str]:
        result = []
        for name, field in obj.get("properties", {}).items():
            path = f"{prefix}{name}"
            kind = field_type(field).replace("|", "\\|")
            required = "yes" if name in obj.get("required", []) else "no"
            result.append(f"| `{path}` | `{kind}` | {required} |")
            result.extend(rows(field, f"{path}."))
            if field.get("type") == "array":
                result.extend(rows(field.get("items", {}), f"{path}[]."))
        return result

    table = ["| Field | JSON value type | Required |", "|---|---|---|"]
    lines = [*table, *rows(schema)]
    definitions = schema.get("$defs", {})
    if definitions:
        links = [f"[`{name}`](#{name.lower()})" for name in definitions]
        lines.extend(["", "Definitions: " + ", ".join(links) + "."])
    for name, definition in definitions.items():
        lines.extend(["", f"#### {name}", ""])
        if "properties" in definition:
            lines.extend([*table, *rows(definition)])
        else:
            lines.append(f"`{field_type(definition)}`")
    return "\n".join(lines)


def generate_session_results_mdx() -> str:
    """Generate the compact Session contract from method source and Pydantic."""
    from composio.core.models.tool_router_session import ToolRouterSession

    methods = []
    for name in ("search", "execute", "execute_meta", "proxy_execute", "tools"):
        method = getattr(ToolRouterSession, name)
        line = inspect.getsourcelines(method)[1]
        methods.append(
            f"### {name}\n\n"
            f"[Method definition]({GITHUB_BASE}/composio/core/models/"
            f"tool_router_session.py#L{line})\n\n"
            f"```python\n{session_method_signature(method)}\n```\n"
        )
    schemas = []
    for name, schema in session_result_schemas().items():
        schemas.append(f"### {name}\n\n{render_schema_tables(schema)}\n")
    return (
        """---
title: "Session results"
description: "Session method signatures, response models, and Pydantic serialization."
---

A Session gives you search and execution methods scoped to one user. Create one with `composio.sessions.create()`, or reuse its ID with `composio.sessions.use()`. See the full [Session reference](/reference/sdk-reference/python/session) for connection and configuration methods.

```python
from composio import Composio
from composio.core.models.tool_router_session import (
    ToolRouterSessionExecuteResponse,
    ToolRouterSessionSearchResponse,
)

composio = Composio()
created = composio.sessions.create(user_id="user-123")
session = composio.sessions.use(created.session_id)
search: ToolRouterSessionSearchResponse = session.search(
    query="Find GitHub repositories",
)
print(search.model_dump(mode="json"))
result: ToolRouterSessionExecuteResponse = session.execute(
    "COMPOSIO_SEARCH_TOOLS",
    arguments={"queries": [{"use_case": "Find GitHub repositories"}]},
)
if result.result_type == "completed":
    print(result.data)
else:
    print(result.error, result.log_id)
print(result.model_dump(mode="json"))
print(result.model_dump_json())
```

Set `COMPOSIO_API_KEY` before running this example. It executes a read-only discovery meta tool; no connected account is needed. The schemas below can be read without credentials.

## Method contracts

`execute(tool_slug, *, arguments=None, ...)` takes the tool's arguments as the keyword-only `arguments` parameter. Its [execution result](#toolroutersessionexecuteresponse) is also returned by `execute_meta()`. [Search results](#toolroutersessionsearchresponse) are separate models with tool schemas and guidance. [Input responses](#toolrouterinputresponse) carry answers to user-input requests. The signatures below come directly from the current method source, including keyword-only markers and defaults; `t` is Python's `typing` module.

"""
        + "\n".join(methods)
        + """

`tools()` returns provider-wrapped tool definitions for your AI framework, not search results or an execution response. Framework tool-call handlers and provider result objects have their own contracts. Don't apply the Session response fields to them. See [Tools](/reference/sdk-reference/python/tools).

For example, [`OpenAIProvider.handle_tool_calls(session=session, response=completion)`](https://github.com/composiohq/composio/blob/next/python/composio/core/provider/_openai.py) returns a list of [`ToolExecutionResponse` dictionaries](https://github.com/composiohq/composio/blob/next/python/composio/core/models/tools.py), not Session Pydantic models. Import `OpenAIProvider` from `composio_openai` when using that provider.

## Execution status and errors

Read `result_type`, which is `"completed"` or `"failed"`, rather than testing whether `error` is truthy. Failed executions can have a `None` or empty error. The Session result has no `successful` field. The log identifier is `log_id`, not `tool_log_id`; locally executed custom tools return an empty log ID.

Calls that require user input raise `composio.exceptions.ToolInputRequiredError` instead of returning an execution result. Repeat the same call with `input_responses` and `request_state` from that exception. Transport failures raise; missing or unknown execution discriminants raise `composio.exceptions.ValidationError`.

## Imports and serialization

Import `ToolRouterSessionExecuteResponse`, `ToolRouterSessionSearchResponse`, `ToolRouterSessionMetaToolSlug`, and `ToolRouterInputResponse` from `composio.core.models.tool_router_session`. The response aliases point to the installed `composio_client` Pydantic models. See their [SDK definitions](https://github.com/composiohq/composio/blob/next/python/composio/core/models/tool_router_session.py).

Execution and search results are Pydantic models, not dictionaries. Use attribute access for fields, `model_dump()` for a Python dictionary, `model_dump(mode="json")` for JSON-compatible values, or `model_dump_json()` for a JSON string. These methods serialize nested response models too. `json.dumps(result)` does not serialize the model directly.

`proxy_execute()` returns a `ToolRouterSessionProxyExecuteResponse` dictionary, not the execution Pydantic model. Import that type from `composio.core.models.custom_tool_types`; use `json.dumps(proxy_result)` rather than `proxy_result.model_dump_json()`. See its [type definition](https://github.com/composiohq/composio/blob/next/python/composio/core/models/custom_tool_types.py).

## Response schemas

These field tables are generated with Pydantic from the actual response models and input-response type. They include every nested model definition. JSON `string`, `integer`, `number`, `boolean`, and `null` correspond to Python `str`, `int`, `float`, `bool`, and `None`. `Any` accepts any value. Required means the field must be present; a nullable type can also hold `None`. Nested rows are required only within their containing object. These are SDK model shapes, not provider result objects.

The client model schema allows a nullable `result_type` for decoding wire responses. Session execution only returns `"completed"` or `"failed"`: input-required responses raise before returning, and missing or unsupported values fail validation. `instant_charge` is present only when requested by the Session and available.

"""
        + "\n".join(schemas)
    )


def main():
    griffe_module = load_griffe()

    print("Starting Python SDK documentation generation...\n")
    print(f"Output: {OUTPUT_DIR}\n")

    # Clean output
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    # Load package
    print("Loading composio package...")
    try:
        package = griffe_module.load("composio", search_paths=[str(PACKAGE_DIR)])
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
                    if isinstance(cls, griffe_module.Class):
                        classes_to_doc[class_name] = {
                            "cls": cls,
                            "access": f"composio.{prop_name}",
                            "prop": prop_name,
                        }
                        prop_to_class[prop_name] = class_name
                        print(f"  Found {class_name} (via composio.{prop_name})")
        except (KeyError, AttributeError):
            continue

    # Add standalone public-facing classes that are not surfaced via a direct
    # ``composio.<property>`` access pattern.
    for class_name, module_name in ADDITIONAL_CLASSES.items():
        try:
            parts = module_name.split(".")
            current = package
            for part in parts:
                current = current.members[part]

            if class_name in current.members:
                cls = current.members[class_name]
                if isinstance(cls, griffe_module.Class):
                    classes_to_doc[class_name] = {
                        "cls": cls,
                        "access": None,
                        "prop": None,
                    }
                    print(f"  Found {class_name}")
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

        file_path = OUTPUT_DIR / f"{slug_for(class_name)}.mdx"
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
            if isinstance(func, griffe_module.Function):
                print(f"  Processing decorator {dec_name}...")
                doc = parse_docstring(func.docstring.value if func.docstring else None)

                params = []
                for p in func.parameters:
                    if p.name in ("self", "cls"):
                        continue
                    params.append(
                        {
                            "name": p.name,
                            "type": format_type(p.annotation, max_length=None),
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

    (OUTPUT_DIR / "session-results.mdx").write_text(generate_session_results_mdx())

    # Generate meta.json
    meta = {
        "title": "Python SDK",
        "pages": [slug_for(c["name"]) for c in documented_classes]
        + ["session-results"],
    }
    (OUTPUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"\nDone! Generated {len(documented_classes)} class docs + index")
    print(f"  Classes: {', '.join(c['name'] for c in documented_classes)}")
    print(f"  Decorators: {', '.join(d['name'] for d in decorators)}")


if __name__ == "__main__":
    main()
