"""Source-only rendering of Session inputs and returned configuration.

Read annotations instead of importing the SDK or copying the generated client's
schema. Only definitions reachable from the three documented roots are emitted.
"""

from __future__ import annotations

import ast
import importlib.util
import re
import tomllib
from pathlib import Path
from typing import Callable

BASE_URL = "/reference/sdk-reference/python/session-options"
ROUTER = "composio.core.models.tool_router"
SESSION = "composio.core.models.tool_router_session"
CLIENT = "composio_client.types.tool_router"


def anchor(module: str, name: str) -> str:
    return f"{module.rsplit('.', 1)[-1]}-{name}".replace("_", "-").lower()


class Shapes:
    """Follow local/imported annotations within the focused source modules."""

    def __init__(self, sources: dict[str, str]):
        self.modules = {name: ast.parse(source) for name, source in sources.items()}
        self.definitions = {}
        self.imports = {}
        self.pending = []
        for module, tree in self.modules.items():
            imports = self.imports[module] = {}
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    imported_module = node.module
                    if node.level:
                        imported_module = importlib.util.resolve_name(
                            "." * node.level + node.module, module.rpartition(".")[0]
                        )
                    for item in node.names:
                        imports[item.asname or item.name] = (
                            f"{imported_module}.{item.name}"
                        )
            for node in tree.body:
                if isinstance(node, ast.ClassDef):
                    self.definitions[module, node.name] = node
                elif isinstance(node, ast.Assign) and isinstance(
                    node.value, (ast.Subscript, ast.Attribute)
                ):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            self.definitions[module, target.id] = node.value
                elif (
                    isinstance(node, ast.AnnAssign)
                    and isinstance(node.target, ast.Name)
                    and node.value is not None
                ):
                    # Generated clients spell aliases as `Name: TypeAlias = ...`.
                    if ast.unparse(node.annotation).endswith("TypeAlias"):
                        self.definitions[module, node.target.id] = node.value

    def resolve(self, module: str, token: str) -> tuple[str, str] | None:
        parts = token.split(".")
        imported = self.imports[module].get(parts[0])
        qualified = (
            ".".join([imported, *parts[1:]]) if imported else f"{module}.{token}"
        )
        owner, _, name = qualified.rpartition(".")
        key = (owner, name)
        return key if key in self.definitions else None

    def type(self, module: str, annotation: ast.AST) -> str:
        text = ast.unparse(annotation)
        text = re.sub(r"\b(?:t|te|typing|typing_extensions)\.", "", text)
        parts = []
        cursor = 0
        # Keep literals intact: a quoted Literal string must never become a link.
        pattern = r""""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*"""
        for match in re.finditer(pattern, text):
            token = match.group()
            key = (
                self.resolve(module, token)
                if not token.startswith(("'", '"'))
                else None
            )
            if key:
                if key not in self.pending:
                    self.pending.append(key)
                prefix = text[cursor : match.start()]
                if prefix:
                    prefix = prefix.replace("|", "\\|")
                    parts.append(f"`{prefix}`")
                parts.append(f"[`{token}`](#{anchor(*key)})")
                cursor = match.end()
        if cursor < len(text):
            suffix = text[cursor:].replace("|", "\\|")
            parts.append(f"`{suffix}`")
        return "".join(parts)

    def method(self, module: str, cls: str, name: str) -> ast.FunctionDef:
        return next(
            node
            for node in reversed(self.definitions[module, cls].body)
            if isinstance(node, ast.FunctionDef) and node.name == name
        )

    def fields(self, module: str, node: ast.ClassDef):
        fields = []
        total = not any(
            k.arg == "total"
            and isinstance(k.value, ast.Constant)
            and k.value.value is False
            for k in node.keywords
        )
        typed_dict = any(ast.unparse(base).endswith("TypedDict") for base in node.bases)
        for base in node.bases:
            key = self.resolve(module, ast.unparse(base))
            if key and isinstance(self.definitions[key], ast.ClassDef):
                fields.extend(self.fields(key[0], self.definitions[key]))
                typed_dict = True
        for index, field in enumerate(node.body):
            if not isinstance(field, ast.AnnAssign) or not isinstance(
                field.target, ast.Name
            ):
                continue
            name = field.target.id
            if name.startswith("_") or name == "model_config":
                continue
            annotation = field.annotation
            required = total if typed_dict else field.value is None
            if isinstance(annotation, ast.Subscript):
                wrapper = ast.unparse(annotation.value).split(".")[-1]
                if wrapper in ("Required", "NotRequired"):
                    required = wrapper == "Required"
                    annotation = annotation.slice
            following = node.body[index + 1 : index + 2]
            description = ""
            if (
                following
                and isinstance(following[0], ast.Expr)
                and isinstance(following[0].value, ast.Constant)
                and isinstance(following[0].value.value, str)
            ):
                description = following[0].value.value
            default = ast.unparse(field.value) if field.value is not None else None
            fields.append((name, annotation, required, default, description, module))
        return fields


def prose(text: str, normalize: Callable[[str], str]) -> str:
    text = normalize(text).replace("—", ". ")
    # MDX expressions are not valid in source docstring examples outside code.
    return "`".join(
        part
        if index % 2
        else part.replace("{", "&#123;").replace("}", "&#125;").replace("<", "&lt;")
        for index, part in enumerate(text.split("`"))
    )


def table_text(text: str, normalize: Callable[[str], str]) -> str:
    return prose(text, normalize).replace("|", "\\|").replace("\n", "<br />")


def parameter_rows(
    shapes: Shapes,
    module: str,
    method: ast.FunctionDef,
    descriptions: dict[str, str],
    normalize,
):
    rows = []
    for param, default in zip(method.args.kwonlyargs, method.args.kw_defaults):
        default_text = (
            f"`{ast.unparse(default)}`" if default is not None else "Required"
        )
        rows.append(
            f"| `{param.arg}` | {shapes.type(module, param.annotation)} | {default_text} | {table_text(descriptions.get(param.arg, ''), normalize)} |"
        )
    return rows


def render_definitions(shapes: Shapes, normalize) -> list[str]:
    """Render exactly the graph seeded by one contract's annotations."""
    client_doc_sources = {
        (SESSION, "ToolRouterSessionConfig"): (
            f"{CLIENT}.session_create_response",
            "Config",
        ),
        (SESSION, "ToolRouterInstantConfig"): (
            f"{CLIENT}.session_patch_params",
            "CurrentInstantVariant1",
        ),
    }
    lines = [
        "## Nested definitions",
        "",
        "Required keys, nullable values, and model defaults are shown independently. "
        "A response model's `None` default is not a server policy default. "
        "Source docstrings describe server defaults where specified.",
        "",
    ]
    index = 0
    while index < len(shapes.pending):
        module, name = shapes.pending[index]
        index += 1
        node = shapes.definitions[module, name]
        lines.extend(
            [
                f'<a id="{anchor(module, name)}"></a>',
                "",
                f"### {name}",
                "",
                "```python",
                f"from {module} import {name}",
                "```",
                "",
            ]
        )
        if module.startswith("composio."):
            relative = Path(*module.split(".")).with_suffix(".py")
            lines.extend(
                [
                    f"[View source](https://github.com/composiohq/composio/blob/next/python/{relative}#L{node.lineno})",
                    "",
                ]
            )
        if not isinstance(node, ast.ClassDef):
            lines.extend([shapes.type(module, node), ""])
            continue
        doc = ast.get_docstring(node) or ""
        summary, _, attributes = doc.partition("\nAttributes:\n")
        if summary:
            summary = summary.split("\nExample:")[0].split("\nExample::")[0]
            lines.extend([prose(summary, normalize), ""])
        for base in node.bases:
            if shapes.resolve(module, ast.unparse(base)):
                lines.extend([f"Inherits {shapes.type(module, base)}.", ""])
        attr_docs = {}
        current = None
        for line in attributes.splitlines():
            match = re.match(r"^    (\w+):\s*(.*)", line)
            if match:
                current = match[1]
                attr_docs[current] = match[2]
            elif current:
                attr_docs[current] += " " + line.strip()
        fields = shapes.fields(module, node)
        client_docs = {}
        if (module, name) in client_doc_sources:
            doc_module, doc_name = client_doc_sources[module, name]
            client_docs = {
                field[0]: field[4]
                for field in shapes.fields(
                    doc_module, shapes.definitions[doc_module, doc_name]
                )
            }
        if name == "ExperimentalToolkit":
            constructor = shapes.method(module, name, "__init__")
            lines.extend(
                [
                    "Constructor keyword arguments:",
                    "",
                    "| Parameter | Type | SDK default | Description |",
                    "| --- | --- | --- | --- |",
                    *parameter_rows(shapes, module, constructor, {}, normalize),
                    "",
                ]
            )
        if fields:
            lines.extend(
                [
                    "| Field | Type | Presence / model default | Description |",
                    "| --- | --- | --- | --- |",
                ]
            )
            for field_name, annotation, required, default, description, owner in fields:
                presence = "Required" if required else "Optional key"
                if default is not None:
                    presence = f"Default: `{default}`"
                desc = (
                    description
                    or attr_docs.get(field_name, "")
                    or client_docs.get(field_name, "")
                )
                lines.append(
                    f"| `{field_name}` | {shapes.type(owner, annotation)} | {presence} | {table_text(desc, normalize)} |"
                )
            lines.append("")
    return lines


def definition_links(shapes: Shapes, slug: str) -> dict[str, str]:
    links = {}
    for module, name in shapes.pending:
        symbol = (
            name
            if module.startswith("composio.")
            else f"{module.rsplit('.', 1)[-1]}.{name}"
        )
        links[symbol] = f"/reference/sdk-reference/python/{slug}#{anchor(module, name)}"
    return links


def frontmatter(title: str, description: str) -> list[str]:
    return ["---", f'title: "{title}"', f'description: "{description}"', "---", ""]


def generate_session_options(package_dir: Path, parse_docstring, normalize):
    version = tomllib.loads((package_dir / "pyproject.toml").read_text())["project"][
        "version"
    ]
    spec = importlib.util.find_spec("composio_client")
    if spec is None or spec.origin is None:
        raise RuntimeError(
            "Session option reference generation requires composio-client"
        )
    client_dir = Path(spec.origin).parent / "types" / "tool_router"
    modules = {
        name: (package_dir / Path(*name.split(".")).with_suffix(".py")).read_text()
        for name in (
            ROUTER,
            SESSION,
            "composio.core.models.custom_tool",
            "composio.core.models.custom_tool_types",
        )
    }
    for name in ("session_patch_params", "session_create_response"):
        modules[f"{CLIENT}.{name}"] = (client_dir / f"{name}.py").read_text()
    pages = {}
    links = {}
    imports = {}
    contracts = (
        ("session-create-options", "Session create options"),
        ("session-update-options", "Session update options"),
        ("session-config", "Session config"),
    )
    for slug, title in contracts:
        shapes = Shapes(modules)
        lines = frontmatter(
            title, f"Python {title.lower()} and source-derived nested types."
        )
        lines.extend([f"Generated from `composio=={version}`.", ""])
        lines.extend([f"[Compare Session contracts]({BASE_URL}).", ""])
        if slug == "session-create-options":
            method = shapes.method(ROUTER, "ToolRouter", "create")
            doc = parse_docstring(ast.get_docstring(method))
            lines.extend(
                [
                    "Pass these keyword arguments to `composio.create()` or `composio.sessions.create()`. "
                    "Python has no saved-config `config` create parameter. "
                    "`None` is the create default for optional policy blocks, not the PATCH reset operation.",
                    "",
                    "## Create input",
                    "",
                    "| Parameter | Type | SDK default | Description |",
                    "| --- | --- | --- | --- |",
                    *parameter_rows(shapes, ROUTER, method, doc["params"], normalize),
                    "",
                ]
            )
        elif slug == "session-update-options":
            method = shapes.method(SESSION, "ToolRouterSession", "update")
            doc = parse_docstring(ast.get_docstring(method))
            patch_module = f"{CLIENT}.session_patch_params"
            descriptions = {
                field[0]: field[4]
                for field in shapes.fields(
                    patch_module, shapes.definitions[patch_module, "SessionPatchParams"]
                )
            }
            lines.extend(
                [
                    prose(doc["description"], normalize),
                    "",
                    "## Update input",
                    "",
                    "| Parameter | Type | SDK default | Description |",
                    "| --- | --- | --- | --- |",
                    *parameter_rows(shapes, SESSION, method, descriptions, normalize),
                    "",
                    "Import the omission sentinel only when you need to pass it explicitly:",
                    "",
                    "```python",
                    "from composio_client import Omit, omit",
                    "```",
                    "",
                    "`SequenceNotStr[str]` means a sequence of strings, not a single string. "
                    "Omission and nullability are separate: an optional dictionary key may be "
                    "absent even when its value type does not include `None`.",
                    "",
                ]
            )
        else:
            root = (SESSION, "ToolRouterSessionConfig")
            shapes.pending.append(root)
            lines.extend(
                [
                    "## Returned config",
                    "",
                    "`session.config` and the value returned by `session.update()` use the SDK's "
                    "`ToolRouterSessionConfig` Protocol. This is a read shape, not a create input. "
                    "Returned filters use `enabled` / `disabled`; input filters use `enable` / "
                    "`disable`. The returned sandbox block is named `workbench`.",
                    "",
                    f"See [{root[1]}](#{anchor(*root)}) for every returned field.",
                    "",
                ]
            )
        # Keep the index import map focused on the SDK types named at the roots.
        for module, name in shapes.pending:
            if module.startswith("composio."):
                imports.setdefault((module, name), slug)
        lines.extend(render_definitions(shapes, normalize))
        pages[slug] = "\n".join(lines)
        links[slug] = definition_links(shapes, slug)

    lines = frontmatter(
        "Session options",
        "Compare Python Session create, update, and returned-config contracts.",
    )
    lines.extend([f"Generated from `composio=={version}`.", ""])
    lines.extend(
        [
            "Choose the contract for the Session operation you're using. "
            "Create input, PATCH input, and returned config are not interchangeable.",
            "",
            "```python",
            "from composio import Composio",
            "",
            "composio = Composio()",
            'session = composio.create(user_id="user_123", toolkits=["github"])',
            'config = session.update(toolkits={"enable": []})',
            "print(config.user_id)",
            "```",
            "",
            "## Contracts",
            "",
            "| Contract | Entry point | Omission and shape |",
            "| --- | --- | --- |",
            "| [Create input](/reference/sdk-reference/python/session-create-options#create-input) "
            "| `composio.create()` / `composio.sessions.create()` "
            "| Optional policy blocks default to `None`. Python has no saved-config `config` create parameter. |",
            "| [PATCH input](/reference/sdk-reference/python/session-update-options#update-input) "
            "| `session.update()` | Omit to preserve a setting; `None` removes an override where supported. "
            "Supplied maps replace stored maps. Empty allowlists deny all. Instant accepts `False` or an object, not `None`. |",
            "| [Returned config](/reference/sdk-reference/python/session-config#returned-config) "
            "| `session.config` / `session.update()` return value "
            "| SDK `ToolRouterSessionConfig` Protocol. Filters use `enabled` / `disabled`; sandbox settings use `workbench`. |",
            "",
            "Each contract page includes all its reachable nested definitions, exact type imports, "
            "and source docstrings. The returned Session config is distinct from saved Session configs.",
            "",
            "## SDK type imports",
            "",
            "Import the SDK types named by the contracts from the modules below. "
            "Nested SDK and generated-client types show their exact imports beside their definitions.",
            "",
            "| Type | Import module |",
            "| --- | --- |",
        ]
    )
    for (module, name), slug in imports.items():
        url = f"/reference/sdk-reference/python/{slug}#{anchor(module, name)}"
        lines.append(f"| [`{name}`]({url}) | `{module}` |")
    lines.extend(["| `Omit`, `omit` | `composio_client` |", ""])
    pages["session-options"] = "\n".join(lines)
    return pages, links
