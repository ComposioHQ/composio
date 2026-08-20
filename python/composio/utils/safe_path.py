"""Path containment primitives for untrusted input.

Every field of an API response is untrusted, including slugs, identifiers, and
filenames. A compromised toolkit or a MITM on the Composio API can set them to
anything. When such a value becomes part of a filesystem path, it must pass
through this module.

Two rules make the difference between a real check and a decorative one:

1. **Anchor on a constant.** Containment is only meaningful when the root is a
   trusted value. Checking a derived path against a directory that untrusted
   input helped build compares tainted against tainted and always passes. A
   directory built as ``root / untrusted_a / untrusted_b`` and then validated
   against that same built directory is checked against a reference the input
   was free to move.

2. **Validate before touching the filesystem.** No ``mkdir``, no ``open``, until
   the final path is known to be inside the root. Otherwise a rejected write
   still leaves attacker-chosen directories behind.

:func:`secure_join` enforces both. Prefer it over hand-rolled
``resolve() / is_relative_to()`` pairs — see ``python/AGENTS.md``.
"""

from __future__ import annotations

import os
import re
import sys
import typing as t
from pathlib import Path, PureWindowsPath

from composio.exceptions import UnsafePathComponentError

SAFE_COMPONENT_REGEX = re.compile(r"^[A-Za-z0-9_-]+$")
"""Characters permitted in a path component derived from untrusted input.

Deliberately identical to ``SLUG_REGEX`` in ``custom_tool_types.py``, which the
SDK already enforces on client-created custom tools. Backend-fetched tools were
never held to the same standard; they are now.

Every one of the 1070 toolkit slugs in the catalog snapshot at
``ts/packages/cli/src/generated/toolkit-slugs.ts`` conforms, so this is not
expected to reject anything legitimate. That snapshot is not the live catalog:
a production slug containing a dot or a non-ASCII character would hard-fail its
downloads rather than degrade.
"""

MAX_COMPONENT_LENGTH = 128
"""Upper bound on a single component, well under the 255-byte limit common to
ext4/APFS/NTFS. Keeps a long slug from raising ``OSError`` mid-write."""

WINDOWS_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
    | {f"COM{i}" for i in "¹²³"}
    | {f"LPT{i}" for i in "¹²³"}
)
"""Reserved DOS device names. Writing to one on Windows targets the device
rather than a file. Rejected on every platform so behaviour does not diverge
between a POSIX developer machine and a Windows deployment."""


def is_inside_dir(child: Path, parent: Path) -> bool:
    """True iff ``child`` equals ``parent`` or is nested inside it on a path
    component boundary.

    ``/tmp/foo`` contains ``/tmp/foo/bar`` but NOT ``/tmp/foo-bar`` — a plain
    string prefix test gets that wrong. Comparison is case-insensitive on
    Windows, where ``C:\\Foo`` and ``c:\\foo`` are the same directory.

    Both arguments are assumed absolute and normalized.
    """
    try:
        child_str = str(child)
        parent_str = str(parent)
        if sys.platform == "win32":
            child_str = child_str.lower()
            parent_str = parent_str.lower()
        if child_str == parent_str:
            return True
        sep = os.sep
        parent_with_sep = parent_str if parent_str.endswith(sep) else parent_str + sep
        return child_str.startswith(parent_with_sep)
    except OSError:
        return False


def assert_safe_path_component(value: str, *, label: str = "path component") -> str:
    """Return ``value`` unchanged if it is safe to use as a single path
    component, else raise.

    Fails closed. Rejects traversal (``..``), separators of either platform,
    absolute paths, drive letters, NUL bytes, reserved device names, and
    anything outside :data:`SAFE_COMPONENT_REGEX`.

    :raises UnsafePathComponentError: when ``value`` is unsafe.
    """
    if not isinstance(value, str) or not value:
        raise UnsafePathComponentError(
            f"Refusing to build a path from an empty or non-string {label}: {value!r}"
        )

    # `PureWindowsPath` treats both `/` and `\` as separators, so a single check
    # catches `../x` and `..\x` regardless of the host platform. A slug crafted
    # for a Windows target must not slip through on a POSIX build machine.
    as_windows_path = PureWindowsPath(value)
    if len(as_windows_path.parts) != 1 or as_windows_path.anchor:
        raise UnsafePathComponentError(
            f"Refusing to build a path from a {label} containing path separators "
            f"or a drive letter: {value!r}"
        )

    if len(value) > MAX_COMPONENT_LENGTH:
        raise UnsafePathComponentError(
            f"Refusing to build a path from a {label} longer than "
            f"{MAX_COMPONENT_LENGTH} characters: {value[:32]!r}... "
            f"({len(value)} characters)"
        )

    # `.` and `..` are excluded by the regex (no `.` in the character class),
    # as are NUL bytes and every separator. The explicit checks above exist to
    # produce a precise error message rather than a generic pattern mismatch.
    #
    # `fullmatch`, not `match`: in a `match`, `$` also matches just before a
    # single trailing newline, so `"GMAIL\n"` would satisfy `^[A-Za-z0-9_-]+$`
    # and reach the filesystem with a control character in the name.
    if not SAFE_COMPONENT_REGEX.fullmatch(value):
        raise UnsafePathComponentError(
            f"Refusing to build a path from an unsafe {label}: {value!r}. "
            f"Expected only letters, digits, underscores, and hyphens "
            f"(pattern {SAFE_COMPONENT_REGEX.pattern})."
        )

    if value.upper() in WINDOWS_RESERVED_NAMES:
        raise UnsafePathComponentError(
            f"Refusing to build a path from a reserved device name as {label}: {value!r}"
        )

    return value


def safe_basename(name: str, *, label: str = "filename") -> str:
    """Collapse an untrusted filename to a bare, writable basename.

    Filenames need their own validator: :func:`assert_safe_path_component`
    forbids ``.``, which nearly every real filename contains. This applies the
    remaining checks — no separators, no traversal, no NUL, bounded length, no
    reserved device name — to the one component a server most directly controls.

    ``PureWindowsPath`` treats both ``/`` and ``\\`` as separators, so a name
    crafted for a Windows target (``..\\..\\evil``) is stripped even when the
    SDK runs on POSIX, where ``Path(...).name`` would return it intact.

    Names that leave no usable basename are refused rather than replaced with a
    generated one: a response that cannot name its own file is malformed or
    hostile, and inventing a name would hide that. ``.`` and the empty string
    both basename to ``""``, which makes an output path equal to its own
    directory and surfaces as ``IsADirectoryError`` at write time.

    :raises UnsafePathComponentError: when ``name`` yields no usable basename or
        is unsafe to write.
    """
    if not isinstance(name, str):
        raise UnsafePathComponentError(
            f"Refusing to write a non-string {label}: {name!r}"
        )

    raw_basename = PureWindowsPath(name).name
    if not raw_basename or not raw_basename.strip() or set(raw_basename) == {"."}:
        raise UnsafePathComponentError(
            f"Path traversal detected: {label} {name!r} leaves no usable "
            "basename to write to."
        )
    if "\x00" in raw_basename:
        raise UnsafePathComponentError(
            f"Refusing to write {label} containing a NUL byte: {name!r}"
        )
    if any(ord(char) < 32 or char in '<>:"|?*' for char in raw_basename):
        raise UnsafePathComponentError(
            f"Refusing to write {label} containing characters reserved by "
            f"Windows: {name!r}"
        )
    if raw_basename.endswith((" ", ".")):
        raise UnsafePathComponentError(
            f"Refusing to write {label} ending in a space or dot: {name!r}"
        )

    basename = raw_basename.strip()
    try:
        encoded_length = len(os.fsencode(basename))
    except UnicodeEncodeError as e:
        raise UnsafePathComponentError(
            f"Refusing to write {label} containing invalid Unicode: {name!r}"
        ) from e
    if encoded_length > MAX_COMPONENT_LENGTH:
        raise UnsafePathComponentError(
            f"Refusing to write {label} longer than {MAX_COMPONENT_LENGTH} bytes: "
            f"{basename[:32]!r}... ({encoded_length} bytes)"
        )
    # Compare everything before the first dot: on Windows `NUL.tar.gz` opens
    # the null device just as `NUL` does, so any number of extensions provides
    # no protection.
    device_name = basename.split(".", 1)[0].rstrip(" ").upper()
    if device_name in WINDOWS_RESERVED_NAMES:
        raise UnsafePathComponentError(
            f"Refusing to write {label} that is a reserved device name: {name!r}"
        )
    return basename


def resolve_root(root: t.Union[str, Path]) -> Path:
    """Normalize a trusted root to an absolute, symlink-resolved path.

    Every containment check must derive its anchor through this one function.
    When two call sites normalize differently — one expanding ``~`` and one not
    — the check compares mismatched paths and rejects legitimate writes while
    reporting them as attacks. Sharing the normalization is what keeps the two
    ends of a containment check comparable.
    """
    expanded = Path(root).expanduser()
    try:
        return expanded.resolve(strict=False)
    except OSError:
        return expanded


def secure_basename_join(
    base: t.Union[str, Path],
    name: str,
    *,
    root: t.Optional[t.Union[str, Path]] = None,
    label: str = "filename",
) -> Path:
    """Join a single untrusted filename under ``base``, contained within ``root``.

    The filename counterpart to :func:`secure_join`, which cannot be reused here
    because it forbids ``.`` — correct for a slug, wrong for ``report.pdf``.

    ``root`` defaults to ``base`` but is separate for the download path, where
    ``base`` is a per-tool subdirectory that untrusted slugs helped build and
    only the configured ``root`` above it is trusted. Anchoring on ``base``
    there would check the result against a directory those slugs had moved.

    :raises UnsafePathComponentError: when ``name`` is unsafe, or when the
        result escapes ``root``.
    """
    resolved_base = resolve_root(base)
    resolved_root = resolved_base if root is None else resolve_root(root)
    candidate = resolved_base / safe_basename(name, label=label)
    if not is_inside_dir(candidate.resolve(), resolved_root):
        raise UnsafePathComponentError(
            f"Path traversal detected: {label} {name!r} resolves to "
            f"{candidate.resolve()}, which is outside {resolved_root}."
        )
    return candidate


def secure_join(root: t.Union[str, Path], *components: str) -> Path:
    """Join untrusted ``components`` beneath the trusted ``root``.

    ``root`` is the sole anchor of trust and must not itself be derived from
    untrusted input — that is the whole point. Each component is validated by
    :func:`assert_safe_path_component`, then the joined result is resolved and
    re-checked against the resolved root. The second check is belt-and-braces:
    it catches a symlink inside ``root`` pointing outside it, which per-component
    validation cannot see.

    Performs no filesystem writes; the caller creates directories only after
    this returns.

    :raises UnsafePathComponentError: when any component is unsafe, or when the
        joined path escapes ``root``.
    """
    resolved_root = resolve_root(root)

    safe_components = [
        assert_safe_path_component(component) for component in components
    ]

    candidate = resolved_root.joinpath(*safe_components)
    try:
        resolved_candidate = candidate.resolve(strict=False)
    except OSError:
        resolved_candidate = candidate

    if not is_inside_dir(resolved_candidate, resolved_root):
        raise UnsafePathComponentError(
            f"Refusing to write outside the configured directory: "
            f"{components!r} resolves to {resolved_candidate}, "
            f"which is outside {resolved_root}."
        )

    return resolved_candidate
