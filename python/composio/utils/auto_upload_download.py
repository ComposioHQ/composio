"""Resolve deprecated vs explicit opt-in for automatic tool file upload/download."""

from __future__ import annotations

import warnings


def resolve_auto_upload_download_files_enabled(
    *,
    dangerously_allow_auto_upload_download_files: bool = False,
    auto_upload_download_files: bool | None = None,
    warn_stacklevel: int = 2,
) -> bool:
    """Return whether automatic file upload/download is enabled.

    ``auto_upload_download_files`` is deprecated; warn when it is explicitly passed.
    """
    if auto_upload_download_files is not None:
        warnings.warn(
            "`auto_upload_download_files` is deprecated and will be removed in a future "
            "version. Use `dangerously_allow_auto_upload_download_files=True` instead.",
            DeprecationWarning,
            stacklevel=warn_stacklevel,
        )
    return bool(dangerously_allow_auto_upload_download_files) or (
        auto_upload_download_files is True
    )
