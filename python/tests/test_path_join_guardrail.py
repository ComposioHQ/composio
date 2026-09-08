"""Guardrail against building filesystem paths out of untrusted input.

The failure mode this prevents: a path built from unvalidated API response
fields, with a containment check that compares the result against the very
directory those fields helped build — tainted against tainted, so it always
passes.

A convention in `AGENTS.md` would not catch that. Such a line gets written by
someone who has already thought about traversal and added a check. So this
enforces the rule mechanically: every path built from something that is
not a literal or a module-level constant must be recorded in `REVIEWED_JOINS`
with a reason, and each entry must still be backed by the validation its reason
cites.

Three properties matter, and each is a test below, because each is easy to get
wrong in a way that leaves the check looking present but doing nothing:

1. **Cover every spelling.** A detector that only understands the `/` operator
   is green while `os.path.join` reintroduces the bug.
2. **Fail closed.** No guessing from variable names — renaming `outdir` to
   `base` must not silently disable the check.
3. **Bind the allowlist to its evidence.** An entry keyed only on source text
   keeps passing after the validation around it is deleted.

To satisfy this test, prefer `composio.utils.safe_path.secure_join`, which
validates each untrusted component and anchors containment on a trusted root.
"""

import ast
import functools
import typing as t
from pathlib import Path

import pytest

PYTHON_ROOT = Path(__file__).parent.parent
SCANNED_ROOTS = (PYTHON_ROOT / "composio", PYTHON_ROOT / "providers")

_PATH_CALLS = frozenset({"Path", "PurePath", "PurePosixPath", "PureWindowsPath"})
"""Constructors whose result is a path."""

_DIRECT_PATH_SINKS = frozenset({"open", "makedirs", "mkdir"})
"""Functions whose first argument becomes a filesystem path."""


def _reviewed_path(
    reason: str,
    *requires: str,
    occurrences: int = 1,
) -> t.Dict[str, t.Any]:
    return {
        "reason": reason,
        "requires": frozenset(requires),
        "occurrences": occurrences,
    }


REVIEWED_JOINS: t.Dict[t.Tuple[str, str], t.Dict[str, t.Any]] = {
    (
        "composio/core/models/_files.py",
        "Path(configured)",
    ): _reviewed_path(
        "`configured` is read from the COMPOSIO_CACHE_DIR environment variable, "
        "which is local configuration, not an API response."
    ),
    (
        "composio/core/models/_files.py",
        "Path(path_in)",
    ): _reviewed_path(
        "`FileUploadable.from_path` converts the caller's local upload path after "
        "the upload allowlist and sensitive-path checks have run.",
        "assert_path_inside_upload_dirs",
        "assert_safe_local_file_upload_path",
    ),
    (
        "composio/core/models/_files.py",
        "Path(outdir)",
    ): _reviewed_path(
        "`FileHelper` accepts this download root from local SDK configuration; API "
        "response values are joined beneath it through the safe-path helpers."
    ),
    (
        "composio/core/models/tool_router_session_files.py",
        "PureWindowsPath(self.mount_relative_path)",
    ): _reviewed_path(
        "This property only extracts a display basename. `RemoteFile.save` validates "
        "the same server value before using it as a filesystem path."
    ),
    (
        "composio/core/models/tool_router_session_files.py",
        "Path(path)",
    ): _reviewed_path(
        "A non-default `RemoteFile.save` destination is selected explicitly by the "
        "caller and does not contain an API-derived path component."
    ),
    (
        "composio/core/models/tool_router_session_files.py",
        "Path(path_str)",
    ): _reviewed_path(
        "The upload input is a caller-selected local file and is checked before it is "
        "read; it is not a path constructed from a remote response.",
        "exists",
        "is_file",
    ),
    (
        "composio/integration_test/conftest.py",
        "Path(__file__)",
    ): _reviewed_path("`__file__` is the trusted location of this installed module."),
    (
        "composio/utils/mimetypes.py",
        "Path(file)",
    ): _reviewed_path(
        "`mimetypes.guess` uses `Path` for suffix parsing only and never accesses the "
        "filesystem."
    ),
    (
        "composio/utils/safe_path.py",
        "PureWindowsPath(value)",
    ): _reviewed_path(
        "The path parser detects cross-platform separators before the component is "
        "accepted by the strict slug pattern.",
        "fullmatch",
    ),
    (
        "composio/utils/safe_path.py",
        "PureWindowsPath(name)",
    ): _reviewed_path(
        "`safe_basename` collapses the value, rejects Windows-invalid forms, checks "
        "its encoded length, and rejects reserved device names.",
        "fsencode",
    ),
    (
        "composio/utils/safe_path.py",
        "Path(root)",
    ): _reviewed_path(
        "`resolve_root` normalizes a caller-supplied trusted anchor before any "
        "containment comparison.",
        "expanduser",
        "resolve",
    ),
    (
        "composio/utils/safe_path.py",
        "resolved_base / safe_basename(name, label=label)",
    ): {
        "reason": (
            "`secure_basename_join`, the sanctioned single-filename join. The "
            "name is collapsed and validated by `safe_basename`, and the result "
            "is re-checked with `is_inside_dir` against a `resolve_root`-derived "
            "anchor that the caller supplies separately from the join base — the "
            "distinction this whole module turns on."
        ),
        "requires": frozenset({"resolve_root", "safe_basename", "is_inside_dir"}),
        "occurrences": 1,
    },
    ("composio/utils/safe_path.py", "resolved_root.joinpath(*safe_components)"): {
        "reason": (
            "`secure_join`, the sanctioned multi-component join. Every component "
            "has passed `assert_safe_path_component`, the root came from "
            "`resolve_root`, and the joined result is re-checked with "
            "`is_inside_dir` before return."
        ),
        "requires": frozenset(
            {"resolve_root", "assert_safe_path_component", "is_inside_dir"}
        ),
        "occurrences": 1,
    },
    (
        "composio/utils/sensitive_file_upload_paths.py",
        "Path(file_path)",
    ): _reviewed_path(
        "This converts a caller-selected upload path so the sensitive-path denylist "
        "can inspect its normalized components.",
        "expanduser",
        "resolve",
    ),
    (
        "composio/utils/upload_dir_allowlist.py",
        "Path(s)",
    ): _reviewed_path(
        "This converts a locally configured upload-allowlist entry and resolves it "
        "before comparisons.",
        "expanduser",
        "resolve",
    ),
}
"""Reviewed dynamic path construction in the shipped Python packages.

Entries outside `safe_path` are limited to caller-selected local paths, local
configuration, module locations, or lexical parsing. API-derived components
must use `secure_join` or `secure_basename_join`.
"""

for _provider_setup in (
    "anthropic",
    "autogen",
    "claude_agent_sdk",
    "crewai",
    "gemini",
    "google",
    "google_adk",
    "langchain",
    "langgraph",
    "llamaindex",
    "openai",
    "openai_agents",
):
    REVIEWED_JOINS[(f"providers/{_provider_setup}/setup.py", "Path(__file__)")] = (
        _reviewed_path("`__file__` is the trusted location of this provider package.")
    )
del _provider_setup


def _module_constants(tree: ast.Module) -> t.Set[str]:
    """Module-level ALL_CAPS names bound to a literal.

    Both halves matter. Without the module-level requirement a function-local
    `SLUG = tool.slug` is exempt; without the literal requirement a module-level
    `SLUG = os.environ[...]` is exempt. Either one is a one-token bypass.
    """
    out: t.Set[str] = set()
    for node in tree.body:
        targets: t.List[ast.expr]
        if isinstance(node, ast.Assign):
            targets = list(node.targets)
            value = node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
            value = node.value
        else:
            continue
        if not _is_literal_expr(value):
            continue
        for tgt in targets:
            if isinstance(tgt, ast.Name) and tgt.id.isupper():
                out.add(tgt.id)
    return out


def _is_literal_expr(node: ast.expr) -> bool:
    """True for expressions built only from literals."""
    try:
        ast.literal_eval(node)
        return True
    except (ValueError, TypeError, SyntaxError, MemoryError, RecursionError):
        return False


def _is_trusted(node: ast.expr, consts: t.Set[str]) -> bool:
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, ast.Name) and node.id in consts:
        return True
    return False


def _call_name(func: ast.expr) -> str:
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return ""


def _is_os_path_join(func: ast.expr) -> bool:
    """`os.path.join(...)` / `posixpath.join(...)`, not `",".join(...)`."""
    if not (isinstance(func, ast.Attribute) and func.attr == "join"):
        return False
    recv = func.value
    if isinstance(recv, ast.Attribute):
        return recv.attr == "path"
    if isinstance(recv, ast.Name):
        return recv.id in {"posixpath", "ntpath", "path"}
    return False


def _is_direct_path_sink(func: ast.expr) -> bool:
    """Builtins or ``os`` functions whose first argument is the path.

    Method calls such as ``Path.open(mode)`` and ``Path.write_bytes(data)``
    carry the path in their receiver, not in the positional arguments. Their
    receiver construction is reviewed separately by the ``_PATH_CALLS`` rule.
    """
    if isinstance(func, ast.Name):
        return func.id in _DIRECT_PATH_SINKS
    return (
        isinstance(func, ast.Attribute)
        and func.attr in _DIRECT_PATH_SINKS
        and isinstance(func.value, ast.Name)
        and func.value.id == "os"
    )


@functools.lru_cache(maxsize=None)
def _read_and_parse(path: Path, mtime_ns: int) -> t.Tuple[str, ast.Module]:
    source = path.read_text()
    return source, ast.parse(source)


def _parse_cached(path: Path) -> t.Tuple[str, ast.Module]:
    """Parse ``path``, reusing the previous result while its mtime is unchanged.

    Keyed on mtime so the detector's own self-tests, which rewrite the same
    synthetic file with different content, still see the new source.
    """
    return _read_and_parse(path, path.stat().st_mtime_ns)


class Join(t.NamedTuple):
    module: str
    lineno: int
    text: str
    kind: str


def _collect_joins(roots: t.Sequence[Path] = SCANNED_ROOTS) -> t.List[Join]:
    """Every path construction from a non-literal, non-module-constant value."""
    found: t.List[Join] = []
    for root in roots:
        if not root.exists():
            continue
        for py in sorted(root.rglob("*.py")):
            try:
                source, tree = _parse_cached(py)
            except SyntaxError:  # pragma: no cover - lint job fails first
                continue
            consts = _module_constants(tree)
            try:
                module = str(py.relative_to(PYTHON_ROOT))
            except ValueError:
                # Synthetic roots used by the detector's own self-tests.
                module = str(py.relative_to(root.parent))

            def record(node: t.Union[ast.expr, ast.stmt], kind: str) -> None:
                text = ast.get_source_segment(source, node) or ""
                found.append(Join(module, node.lineno, " ".join(text.split()), kind))

            for node in ast.walk(tree):
                if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                    if not _is_trusted(node.right, consts):
                        record(node, "div")
                elif isinstance(node, ast.AugAssign) and isinstance(node.op, ast.Div):
                    if not _is_trusted(node.value, consts):
                        record(node, "augdiv")
                elif isinstance(node, ast.Call):
                    name = _call_name(node.func)
                    args = node.args
                    if name == "joinpath":
                        if any(not _is_trusted(a, consts) for a in args):
                            record(node, "joinpath")
                    elif _is_os_path_join(node.func):
                        if any(not _is_trusted(a, consts) for a in args):
                            record(node, "os.path.join")
                    elif name in _PATH_CALLS:
                        if any(not _is_trusted(a, consts) for a in args):
                            record(node, "Path(...)")
                    elif _is_direct_path_sink(node.func):
                        if args and not _is_trusted(args[0], consts):
                            record(node, name)
    return found


def _enclosing_function_calls(module: str, lineno: int) -> t.Set[str]:
    """Names called inside the function containing ``lineno``."""
    path = PYTHON_ROOT / module
    _, tree = _parse_cached(path)
    best: t.Optional[t.Union[ast.FunctionDef, ast.AsyncFunctionDef]] = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end = getattr(node, "end_lineno", None) or lineno
            if node.lineno <= lineno <= end:
                if best is None or node.lineno > best.lineno:  # innermost
                    best = node
    if best is None:
        return set()
    return {_call_name(n.func) for n in ast.walk(best) if isinstance(n, ast.Call)}


def test_every_untrusted_path_join_is_reviewed():
    unreviewed = [
        j for j in _collect_joins() if (j.module, j.text) not in REVIEWED_JOINS
    ]
    assert not unreviewed, (
        "Found path construction(s) from non-constant input that are not "
        "recorded in REVIEWED_JOINS:\n"
        + "\n".join(f"  [{j.kind}] {j.module}:{j.lineno}: {j.text}" for j in unreviewed)
        + "\n\nIf the value can come from an API response, use "
        "`composio.utils.safe_path.secure_join(root, *components)` instead. "
        "If the construction is genuinely safe, add it to REVIEWED_JOINS in "
        f"{Path(__file__).name} with a reason and the validators it relies on."
    )


def test_reviewed_joins_all_still_exist():
    """Keeps the allowlist from rotting into stale entries that silently permit
    whatever moves into their place."""
    found = {(j.module, j.text) for j in _collect_joins()}
    stale = set(REVIEWED_JOINS) - found
    assert not stale, (
        "REVIEWED_JOINS entries no longer present in the source (remove them):\n"
        + "\n".join(f"  {m}: {tx}" for m, tx in sorted(stale))
    )


def test_reviewed_joins_still_have_their_validation():
    """Entries that depend on validators still call them in the same function."""
    for join in _collect_joins():
        entry = REVIEWED_JOINS.get((join.module, join.text))
        if entry is None:
            continue
        calls = _enclosing_function_calls(join.module, join.lineno)
        missing = entry["requires"] - calls
        assert not missing, (
            f"{join.module}:{join.lineno}: `{join.text}` is allowlisted because "
            f"it is guarded by {sorted(entry['requires'])}, but "
            f"{sorted(missing)} is no longer called in the enclosing function. "
            "Either restore the validation or re-review the entry."
        )


def test_reviewed_joins_occurrence_counts_match():
    """One entry must not blanket-approve unlimited future joins that happen to
    share its source text."""
    counts: t.Dict[t.Tuple[str, str], int] = {}
    for join in _collect_joins():
        counts[(join.module, join.text)] = counts.get((join.module, join.text), 0) + 1
    for key, entry in REVIEWED_JOINS.items():
        actual = counts.get(key, 0)
        assert actual == entry["occurrences"], (
            f"{key[0]}: `{key[1]}` appears {actual} time(s), but the "
            f"REVIEWED_JOINS entry expects {entry['occurrences']}. A new "
            "occurrence is not covered by the existing review."
        )


EVASIONS = {
    "div": "return self._outdir / tool.toolkit.slug / tool.slug",
    "div-unhinted-name": "return base / tool.slug",
    "augdiv": "p = Path('/tmp')\n    p /= tool.slug\n    return p",
    "joinpath": "return self._outdir.joinpath(tool.slug)",
    "os.path.join": "return os.path.join(self._outdir, tool.slug)",
    "Path(a, b)": "return Path(self._outdir, tool.slug)",
    "Path(value)": "return Path(tool.slug)",
    "Path(value, literal)": "return Path(tool.slug, 'payload')",
    "Path(value).write": "Path(tool.slug).write_bytes(b'x')\n    return None",
    "f-string": "return Path(f'{self._outdir}/{tool.slug}')",
    "concat": "return Path(self._outdir + '/' + tool.slug)",
    "local-uppercase": "SLUG = tool.slug\n    return self._outdir / SLUG",
    "open-direct": "return open(tool.slug, 'rb')",
    "open-fstring": "return open(f'{self._outdir}/{tool.slug}', 'rb')",
    "mkdir-direct": "return os.mkdir(tool.slug)",
    "makedirs-concat": "return os.makedirs(self._outdir + tool.slug)",
}


@pytest.mark.parametrize("label", sorted(EVASIONS))
def test_detector_catches_known_evasions(label, tmp_path):
    """Each of these builds a path from untrusted input in a different
    spelling. A detector that recognizes only the first stays green for the
    rest, which is the whole reason this test is table-driven."""
    pkg = tmp_path / "composio"
    pkg.mkdir()
    (pkg / "vulnerable.py").write_text(
        "import os\nfrom pathlib import Path\n\n\n"
        f"def f(self, tool):\n    {EVASIONS[label]}\n"
    )
    found = _collect_joins([pkg])
    assert found, f"detector missed evasion: {label}"


def test_module_constant_exemption_requires_a_literal(tmp_path):
    """A module-level ALL_CAPS name bound at runtime is not a constant."""
    pkg = tmp_path / "composio"
    pkg.mkdir()
    (pkg / "vulnerable.py").write_text(
        "import os\nfrom pathlib import Path\n\n"
        "SAFE = 'literal'\n"
        "SLUG = os.environ['SLUG']\n\n\n"
        "def f(self):\n    return self._outdir / SLUG\n"
    )
    assert _collect_joins([pkg]), "runtime-bound ALL_CAPS name was treated as constant"

    (pkg / "vulnerable.py").write_text(
        "from pathlib import Path\n\n"
        "SAFE = 'literal'\n\n\n"
        "def f(self):\n    return self._outdir / SAFE\n"
    )
    assert not _collect_joins([pkg]), "literal module constant should be exempt"


def test_scan_roots_are_pinned():
    """Narrowing the scan silently shrinks the guarantee, so the roots are
    asserted rather than assumed."""
    assert {p.name for p in SCANNED_ROOTS} == {"composio", "providers"}
    for root in SCANNED_ROOTS:
        assert root.is_dir(), f"scanned root missing: {root}"
