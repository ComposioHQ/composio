"""Allowlist enforcement for automatic file upload during tool execution.

This is only consulted when
``dangerously_allow_auto_upload_download_files=True``. Manual upload APIs are
not subject to the allowlist (parity with the TypeScript SDK).

- A local path is accepted iff its symlink-resolved absolute path is inside one
  of the allowed directories on a path-component boundary. ``/tmp/foo`` allows
  ``/tmp/foo/bar`` but NOT ``/tmp/foo-bar``.
- URLs never hit this check.
- User-provided ``file_upload_dirs`` fully REPLACES the default
  ``[~/.composio/temp]``.
- On Windows, path comparisons are case-insensitive.
"""

from __future__ import annotations

import os
import sys
import typing as t
from pathlib import Path

from composio.exceptions import (
    FileUploadPathNotAllowedError,
    SDKFileNotFoundError,
)

UPLOAD_TEMP_DIRECTORY_NAME = "temp"


def get_default_upload_dir() -> t.Optional[Path]:
    """Absolute path of the default upload staging directory
    (``<home>/.composio/temp``), or None when a home directory cannot be
    determined."""
    try:
        home = Path.home()
    except (RuntimeError, OSError):
        return None
    return (home / ".composio" / UPLOAD_TEMP_DIRECTORY_NAME).resolve()


def ensure_dir_exists(p: Path) -> None:
    """Best-effort directory creation. Allowlist enforcement still works if
    creation fails (e.g. read-only filesystem)."""
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


FileUploadDirs = t.Union[t.Sequence[str], t.Literal[False], None]
"""User-facing type for ``file_upload_dirs``.

- ``None`` (default) -> use ``[<home>/.composio/temp]``.
- ``False`` -> reject every local path during auto-upload (URLs / bytes still
  work).
- ``[]`` -> same as ``False`` (kept as an alias; prefer ``False``).
- ``Sequence[str]`` (non-empty) -> allowlist replacing the default.
"""


def resolve_effective_upload_allowlist(
    user_dirs: FileUploadDirs,
) -> t.List[Path]:
    """Resolve the effective allowlist.

    - ``None`` -> ``[<default>]`` when available, else ``[]`` (fail-closed).
    - ``False`` -> ``[]`` (explicit "reject all local paths"). URLs and
      in-memory bytes still work because they aren't path-checked.
    - ``Sequence[str]`` (including ``[]``) REPLACES the default and is returned
      verbatim after ``~``-expansion and ``resolve()``. ``[]`` is treated as
      equivalent to ``False``.
    - Empty / blank / non-string entries are skipped.
    - Duplicates are removed (case-insensitive on Windows).
    """
    if user_dirs is None:
        default = get_default_upload_dir()
        return [default] if default is not None else []
    if user_dirs is False:
        return []

    seen: t.Set[str] = set()
    out: t.List[Path] = []
    for raw in user_dirs:
        if not isinstance(raw, (str, os.PathLike)):
            continue
        s = str(raw).strip()
        if not s:
            continue
        abs_path = Path(s).expanduser().resolve()
        key = str(abs_path).lower() if sys.platform == "win32" else str(abs_path)
        if key in seen:
            continue
        seen.add(key)
        out.append(abs_path)
    return out


def _is_inside_dir(child: Path, parent: Path) -> bool:
    """True iff ``child`` equals ``parent`` or is nested inside on a component
    boundary. Assumes both are absolute and normalized."""
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


def _format_allowlist(dirs: t.Sequence[Path]) -> str:
    if not dirs:
        return "  (none configured — all local paths are blocked)"
    return "\n".join(f"  - {d}" for d in dirs)


def _build_help_footer(allowlist: t.Sequence[Path]) -> str:
    return "\n".join(
        [
            "",
            "Allowed upload directories (file_upload_dirs):",
            _format_allowlist(allowlist),
            "",
            "Fix one of the following:",
            "",
            "  1. Recommended — move the file under an allowed directory, or add your",
            "     directory to the allowlist:",
            "       Composio(",
            "         file_upload_dirs=['/abs/path/to/uploads', '~/.composio/temp'],",
            "       )",
            "     Note: user-provided `file_upload_dirs` REPLACES the default",
            "     `~/.composio/temp`. Include it explicitly if you want staged uploads",
            "     to keep working.",
            "",
            "  2. Pass the file by URL (http://... / https://...) instead of a",
            "     filesystem path. URLs are never path-checked.",
            "",
            "  3. (Dangerous) Bypass the allowlist entirely by opting into automatic",
            "     file upload/download from any readable path:",
            "       Composio(dangerously_allow_auto_upload_download_files=True, ...)",
            "     WARNING: This lets a prompt-injected or misbehaving tool read ANY",
            "     file the process can access. Only enable it in trusted, sandboxed",
            "     environments. The built-in sensitive-path denylist (.ssh, .aws,",
            "     .env, private SSH keys, etc.) still applies unless you also set",
            "     `sensitive_file_upload_protection=False`.",
        ]
    )


def assert_path_inside_upload_dirs(
    file_path: t.Union[str, Path],
    allowlist: t.Sequence[Path],
) -> None:
    """Raise an elaborate error if the path is missing or outside the allowlist.

    :raises SDKFileNotFoundError: when ``file_path`` does not exist on disk.
    :raises FileUploadPathNotAllowedError: when resolved path is outside every
        entry of ``allowlist`` (including when allowlist is empty).
    """
    attempted = str(file_path)
    abs_path = Path(attempted).expanduser()
    try:
        abs_path = abs_path.resolve(strict=False)
    except OSError:
        pass

    if not abs_path.exists():
        cwd = Path.cwd()
        parent = abs_path.parent
        parent_exists = parent.exists()
        raise SDKFileNotFoundError(
            "\n".join(
                [
                    f'Refusing to auto-upload "{attempted}": the file does not exist on disk.',
                    "",
                    f"Path attempted:   {attempted}",
                    f"Resolved to:      {abs_path}",
                    f"Process cwd:      {cwd}",
                    f"Parent exists:    {'yes (' + str(parent) + ')' if parent_exists else 'no (' + str(parent) + ')'}",
                    "",
                    "Common causes:",
                    "  - Typo in the filename passed to the tool.",
                    "  - Relative path resolved against the wrong working directory",
                    "    (relative paths use os.getcwd() at the moment of upload).",
                    "  - File was deleted between the tool being called and the upload starting.",
                    "",
                    _build_help_footer(allowlist),
                ]
            )
        )

    try:
        real_path = abs_path.resolve(strict=True)
    except OSError:
        real_path = abs_path

    if not allowlist:
        raise FileUploadPathNotAllowedError(
            "\n".join(
                [
                    f'Refusing to auto-upload "{attempted}": no upload directories are configured.',
                    "",
                    f"Path attempted:   {attempted}",
                    f"Resolved to:      {real_path}",
                    "",
                    "Automatic file upload during tool execution is locked down by default",
                    "to prevent a prompt-injected tool from exfiltrating server files",
                    "(source code, .env, SSH keys, etc.).",
                    _build_help_footer(allowlist),
                ]
            )
        )

    for dir_entry in allowlist:
        try:
            real_dir = Path(dir_entry).expanduser().resolve(strict=False)
        except OSError:
            real_dir = Path(dir_entry)
        if _is_inside_dir(real_path, real_dir):
            return

    raise FileUploadPathNotAllowedError(
        "\n".join(
            [
                f'Refusing to auto-upload "{attempted}": resolved path is not inside any',
                "directory in the configured `file_upload_dirs` allowlist.",
                "",
                f"Path attempted:   {attempted}",
                f"Resolved to:      {real_path}",
                _build_help_footer(allowlist),
            ]
        )
    )
