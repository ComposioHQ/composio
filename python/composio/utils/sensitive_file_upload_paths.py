"""Block accidental upload of local files from well-known secret/credential locations."""

from __future__ import annotations

import re
import typing as t
from pathlib import Path

# Path components that indicate a sensitive directory anywhere in a resolved local path.
BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS: t.Tuple[str, ...] = (
    ".ssh",
    ".aws",
    ".azure",
    ".gnupg",
    ".kube",
    ".docker",
    ".claude",  # may contain API keys and project context read by assistants
    ".password-store",
    "keychains",
)

_SECRET_LIKE_BASENAME = re.compile(r"^(\.env(\.|$)|\.netrc$|\.pgpass$)", re.IGNORECASE)
_DEFAULT_PRIVATE_KEY_BASENAME = re.compile(
    r"^id_(rsa|ed25519|ecdsa|dsa|ecdsa_sk)(\.old)?$", re.IGNORECASE
)


def _normalize_path_segments(file_path: t.Union[str, Path]) -> t.List[str]:
    p = Path(file_path).expanduser()
    try:
        resolved = p.resolve()
    except OSError:
        resolved = p
    parts = [part for part in resolved.as_posix().split("/") if part]
    if parts and parts[0].endswith(":"):
        # Windows path: "C:/Users/..." -> drop drive letter segment
        parts = parts[1:]
    return parts


def _get_block_reason(
    file_path: t.Union[str, Path],
    additional_deny_segments: t.Optional[t.Sequence[str]] = None,
) -> t.Optional[str]:
    extra = [s.strip() for s in (additional_deny_segments or []) if s and s.strip()]
    deny: t.Set[str] = {s.lower() for s in BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS}
    deny.update(s.lower() for s in extra)

    segments = _normalize_path_segments(file_path)
    # Case-insensitive segment match: lower each path component once per check.
    for seg, key in zip(segments, (s.lower() for s in segments), strict=True):
        if key in deny:
            return f'path segment "{seg}" is in the sensitive file upload denylist'

    if not segments:
        return None
    basename = segments[-1]
    if _SECRET_LIKE_BASENAME.search(basename) or _DEFAULT_PRIVATE_KEY_BASENAME.match(
        basename
    ):
        return (
            f'file name "{basename}" looks like a credential, env, or private key file'
        )
    if basename.lower() == "credentials":
        return 'file name "credentials" is often used for cloud/API credential stores'
    return None


def is_blocked_sensitive_file_upload_path(
    file_path: t.Union[str, Path],
    additional_deny_segments: t.Optional[t.Sequence[str]] = None,
) -> bool:
    return _get_block_reason(file_path, additional_deny_segments) is not None


def assert_safe_local_file_upload_path(
    file_path: t.Union[str, Path],
    *,
    enabled: bool = True,
    additional_deny_segments: t.Optional[t.Sequence[str]] = None,
) -> None:
    """Raise SensitiveFilePathBlockedError if *file_path* matches the denylist."""
    if not enabled:
        return
    reason = _get_block_reason(file_path, additional_deny_segments)
    if reason:
        from composio.exceptions import SensitiveFilePathBlockedError

        raise SensitiveFilePathBlockedError(
            f"Refusing to upload: {reason}. "
            "Set sensitive_file_upload_protection=False on Composio if you must "
            "(not recommended), or use a copy outside sensitive locations."
        )
