"""Compile docs snippets and attribute mypy diagnostics to resolved SDK symbols.

The TypeScript driver passes a request file containing workDir, sdkPython,
syntaxOnly, and snippets ({id, code, typeCheck}). No snippet is executed. Results
separate SDK API diagnostics from other mypy diagnostics; line numbers are
snippet-relative, with the prelude removed. The pinned mypy build API supplies
resolved expression types, so local aliases, nested scopes, and same-named
third-party classes cannot change SDK attribution.
"""

from __future__ import annotations

import ast
import io
import json
import os
import re
import symtable
import sys
import tokenize
from pathlib import Path

HERE = Path(__file__).resolve().parent
PYTHON_ROOT = HERE.parents[2] / "python"
PRELUDE = HERE / "prelude.py"
# Some diagnostics, such as unused-ignore, have no column; they must not be dropped.
MYPY_LINE = re.compile(r'^(\w+)\.py:(\d+)(?::(\d+))?: (error|note): (.*?)(?:  \[([\w-]+)\])?$')
CALL_CODES = {"call-arg", "call-overload", "arg-type", "typeddict-item", "typeddict-unknown-key"}
ATTRIBUTE_CODES = {"attr-defined", "union-attr"}
IMPORT_CODES = {"import-not-found", "import-untyped"}
# Value misuse whose owner is an expression type: indexing an SDK model and
# assigning an SDK result to an incompatible annotation.
VALUE_CODES = {"index", "assignment"}
TYPE_IGNORE = re.compile(r"#\s*type:\s*ignore\b(\[[^\]]*\])?")


def bound_names(code: str) -> set[str]:
    """Module bindings only: a function parameter/local cannot hide the prelude.

    Python's symbol table also handles comprehensions, pattern bindings, and
    global declarations without treating nested lexical scopes as module scope.
    """
    return {
        symbol.get_name()
        for symbol in symtable.symtable(code, "snippet.py", "exec").get_symbols()
        if symbol.is_assigned() or symbol.is_imported() or symbol.is_namespace()
    }


def prelude_bindings(source: str) -> list[tuple[int, str | None]]:
    """(0-based line, public name it binds); None means always keep the line."""
    lines = source.splitlines()
    bindings: list[tuple[int, str | None]] = [(i, None) for i in range(len(lines))]
    for stmt in ast.parse(source).body:
        name: str | None = None
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            name = stmt.target.id
        elif isinstance(stmt, (ast.Import, ast.ImportFrom)) and len(stmt.names) == 1:
            alias = stmt.names[0]
            name = alias.asname or alias.name.split(".")[0]
        if name is None or name.startswith("_"):
            continue
        if stmt.end_lineno != stmt.lineno:
            raise SystemExit(f"prelude.py:{stmt.lineno}: bindings must fit on one line")
        bindings[stmt.lineno - 1] = (stmt.lineno - 1, name)
    return bindings


def module_source(prelude_lines: list[str], bindings: list[tuple[int, str | None]], snippet: ast.Module, code: str) -> str:
    """Blank shadowed bindings without changing diagnostic line offsets."""
    bound = bound_names(code)
    kept = ["" if name in bound else prelude_lines[i] for i, name in bindings]
    # Future imports must still precede the prelude's normal imports. Reuse its
    # first comment line and blank their original lines, preserving every offset.
    futures = [stmt for stmt in snippet.body if isinstance(stmt, ast.ImportFrom) and stmt.module == "__future__"]
    code_lines = code.splitlines()
    if futures:
        if not kept[0].startswith("#"):
            raise SystemExit("prelude.py must start with a comment reserved for future imports")
        kept[0] = "; ".join(ast.unparse(stmt) for stmt in futures)
        for stmt in futures:
            for i in range(stmt.lineno - 1, stmt.end_lineno):
                code_lines[i] = ""
    return "\n".join([*kept, *code_lines]) + "\n"


def provider_packages() -> list[Path]:
    return sorted((PYTHON_ROOT / "providers").glob("*/composio_*"))


def run_mypy(files: list[str], request: dict, trees: dict[str, ast.Module], prelude_lines: int) -> dict[str, list]:
    from mypy.build import build
    from mypy.errors import CompileError
    from mypy.inspections import find_all_by_location
    from mypy.main import process_options
    from mypy.nodes import CallExpr, IndexExpr, MemberExpr, MypyFile, RefExpr, Var
    from mypy.types import CallableType, Instance, Overloaded, TypedDictType, TypeType, UnionType, get_proper_type

    packages = {"composio", "composio_client", *(path.name for path in provider_packages())}

    def sdk_name(fullname: str) -> bool:
        return fullname.split(".")[0] in packages

    def sdk_type(typ) -> bool:
        typ = get_proper_type(typ)
        if isinstance(typ, Instance):
            return sdk_name(typ.type.fullname)
        if isinstance(typ, CallableType):
            definition = typ.definition
            return bool(definition and sdk_name(definition.fullname)) or (
                typ.is_type_obj() and sdk_name(typ.type_object().fullname)
            )
        if isinstance(typ, (UnionType, Overloaded)):
            return any(sdk_type(item) for item in typ.items)
        if isinstance(typ, TypeType):
            return sdk_type(typ.item)
        if isinstance(typ, TypedDictType):
            return sdk_type(typ.fallback)
        return False

    # Editable installs use an import hook mypy cannot follow. Resolve the SDK
    # and ALL local provider packages from source, not a published SDK wheel.
    os.environ["MYPYPATH"] = os.pathsep.join([str(PYTHON_ROOT), *(str(path.parent) for path in provider_packages())])
    sources, options = process_options([
        "--config-file=",
        "--python-version=3.12",
        f"--python-executable={request['sdkPython']}",
        "--follow-imports=silent",
        "--check-untyped-defs",
        "--allow-redefinition",
        # A documented typing gap must still be real: stale ignores fail.
        "--warn-unused-ignores",
        "--show-error-codes",
        "--show-column-numbers",
        "--hide-error-context",
        "--no-pretty",
        "--no-color-output",
        "--no-error-summary",
        # Cached modules don't retain expression types. Attribution must not
        # disappear on a warm cache (nor depend on another developer's cache).
        "--no-incremental",
        *files,
    ])
    options.export_types = True
    options.preserve_asts = True
    try:
        result = build(sources, options)
    except CompileError as error:
        raise SystemExit("mypy failed:\n" + "\n".join(error.messages)) from error

    def sdk_reference(expression) -> bool:
        if not isinstance(expression, RefExpr) or expression.node is None:
            return False
        node = expression.node
        if isinstance(node, MypyFile):
            return sdk_name(node.fullname)
        # Mypy gives local parameters bare fullnames, e.g. an int parameter
        # named "composio". Only a resolved module may own a package-only name;
        # other SDK symbols must have a qualified definition inside the package.
        return "." in node.fullname and sdk_name(node.fullname)

    def sdk_expression(expression) -> bool:
        if sdk_reference(expression):
            return True
        if sdk_type(result.types.get(expression)):
            return True
        if isinstance(expression, MemberExpr):
            return sdk_type(result.types.get(expression.expr)) or sdk_reference(expression.expr)
        return False

    def sdk_import(snippet_id: str, line: int) -> bool:
        for node in ast.walk(trees[snippet_id]):
            if not isinstance(node, (ast.Import, ast.ImportFrom)) or not node.lineno <= line <= node.end_lineno:
                continue
            modules = [node.module or ""] if isinstance(node, ast.ImportFrom) else [alias.name for alias in node.names]
            return any(sdk_name(module) for module in modules)
        return False

    def sdk_symbol(symbol) -> bool:
        node = symbol.node if symbol is not None else None
        if isinstance(node, Var):
            return sdk_type(node.type)
        if isinstance(node, MypyFile):
            return sdk_name(node.fullname)
        return node is not None and "." in node.fullname and sdk_name(node.fullname)

    api: list[dict] = []
    other: list[dict] = []
    directives: list[dict] = []
    for text in result.errors:
        match = MYPY_LINE.match(text)
        if not match:
            continue
        snippet_id, line_text, column_text, severity, message, code = match.groups()
        if severity != "error" or snippet_id not in trees:
            continue
        line, column = int(line_text), int(column_text or 1) - 1
        snippet_line = line - prelude_lines
        if snippet_line < 1:
            raise SystemExit(f"Python snippet prelude failed: {text}")
        sdk = False
        if code == "unused-ignore":
            directives.append({"id": snippet_id, "line": snippet_line, "message": f"{message} [{code}]"})
            continue
        if code in IMPORT_CODES or (code == "attr-defined" and sdk_import(snippet_id, snippet_line)):
            sdk = sdk_import(snippet_id, snippet_line)
        elif code in ATTRIBUTE_CODES | CALL_CODES | VALUE_CODES:
            expressions = find_all_by_location(result.files[snippet_id], line, column)
            if code in ATTRIBUTE_CODES:
                attribute = re.search(r'has no attribute "([^"]+)"', message)
                owner = next((
                    expr for expr in expressions
                    if isinstance(expr, MemberExpr) and attribute and expr.name == attribute[1]
                ), None)
                # A diagnostic on schema.input_parameters["properties"].pop()
                # starts at schema, just like the inner SDK member access. The
                # missing member's own receiver (object here), not an unrelated
                # inner SDK-valued expression, determines its provenance.
                sdk = owner is not None and sdk_expression(owner)
            elif code == "index":
                # `response["status"]` on an SDK model: the indexed receiver,
                # not the index value or the enclosing call, owns the error.
                subscript = next((expr for expr in expressions if isinstance(expr, IndexExpr)), None)
                sdk = subscript is not None and sdk_expression(subscript.base)
            elif code == "assignment":
                # Mypy reports assignments at the rvalue; the outermost
                # expression at that position is the assigned value.
                sdk = bool(expressions) and (
                    sdk_type(result.types.get(expressions[-1]))
                    or (isinstance(expressions[-1], CallExpr) and sdk_expression(expressions[-1].callee))
                )
            else:
                call = next((expr for expr in expressions if isinstance(expr, CallExpr)), None)
                sdk = call is not None and sdk_expression(call.callee)
                if code.startswith("typeddict-"):
                    # A missing key on an SDK TypedDict belongs to the indexed
                    # receiver even when it is an argument to a non-SDK call.
                    sdk = sdk or any(
                        isinstance(expr, IndexExpr) and sdk_type(result.types.get(expr.base))
                        for expr in expressions
                    ) or (call is None and any(sdk_type(result.types.get(expr)) for expr in expressions))
        elif code == "name-defined":
            # An undefined name is fragment context, unless mypy identifies it
            # as a misspelling of a binding that holds an SDK object.
            sdk = any(
                sdk_symbol(result.files[snippet_id].names.get(name))
                for name in re.findall(r'"([^"]+)"', message.partition("did you mean")[2])
            )
        diagnostic = {"id": snippet_id, "line": snippet_line, "message": f"{message} [{code}]"}
        (api if sdk else other).append(diagnostic)
    return {"api": api, "other": other, "directives": directives, "mypy": result.errors}


def ignore_directives(snippet_id: str, code: str, tree: ast.Module) -> list[dict]:
    """A `# type: ignore` must name its error codes and carry an explanation.

    The explanation may follow the ignore on the same line, sit inside the
    enclosing statement, or be the comment line directly above it. This
    mirrors the TypeScript gate's rejection of blanket suppressions.
    """
    comments = {
        token.start[0]: token.string
        for token in tokenize.generate_tokens(io.StringIO(code).readline)
        if token.type == tokenize.COMMENT
    }
    lines = code.splitlines()
    statements = [node for node in ast.walk(tree) if isinstance(node, ast.stmt)]
    directives: list[dict] = []
    for line, comment in comments.items():
        match = TYPE_IGNORE.search(comment)
        if not match:
            continue
        if not match[1] or not match[1].strip("[] "):
            directives.append({"id": snippet_id, "line": line, "message": (
                "`# type: ignore` must name the suppressed mypy error codes, e.g. `# type: ignore[arg-type]`"
            )})
            continue
        enclosing = min(
            (stmt for stmt in statements if stmt.lineno <= line <= (stmt.end_lineno or stmt.lineno)),
            key=lambda stmt: (stmt.end_lineno or stmt.lineno) - stmt.lineno,
            default=None,
        )
        start, end = (enclosing.lineno, enclosing.end_lineno or enclosing.lineno) if enclosing else (line, line)
        explained = (
            bool(comment[match.end():].strip(" #"))
            or any(other != line and start <= other <= end for other in comments)
            or (start - 1 in comments and lines[start - 2].lstrip().startswith("#"))
        )
        if not explained:
            directives.append({"id": snippet_id, "line": line, "message": (
                "`# type: ignore` needs a comment explaining the verified SDK typing gap"
            )})
    return directives


def main() -> None:
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    work_dir = Path(request["workDir"])
    syntax: list[dict] = []
    parsed: list[tuple[str, str, ast.Module]] = []
    for snippet in request["snippets"]:
        name = f"{snippet['id']}.py"
        try:
            compile(snippet["code"], name, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)
            tree = ast.parse(snippet["code"], name)
        except SyntaxError as error:
            syntax.append({"id": snippet["id"], "line": error.lineno or 1, "message": error.msg})
            continue
        if snippet["typeCheck"]:
            parsed.append((snippet["id"], snippet["code"], tree))

    prelude_source = PRELUDE.read_text(encoding="utf-8")
    prelude_lines = prelude_source.splitlines()
    bindings = prelude_bindings(prelude_source)
    output: dict[str, list] = {"syntax": syntax, "api": [], "other": [], "directives": [], "mypy": []}
    if not request["syntaxOnly"] and parsed:
        files: list[str] = []
        for snippet_id, code, tree in parsed:
            path = work_dir / f"{snippet_id}.py"
            path.write_text(module_source(prelude_lines, bindings, tree, code), encoding="utf-8")
            files.append(path.name)
        os.chdir(work_dir)
        output.update(run_mypy(files, request, {name: tree for name, _, tree in parsed}, len(prelude_lines)))
        output["directives"] += [
            directive for snippet_id, code, tree in parsed for directive in ignore_directives(snippet_id, code, tree)
        ]
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
