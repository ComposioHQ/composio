"""
Test storage helper.
"""

import tempfile
from pathlib import Path

from composio.storage.base import LocalStorage


def test_local_storage() -> None:
    """Test `LocalStorage` object."""

    class _Store(LocalStorage):
        name: str

    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir, "store.json")
        dstore = _Store(
            path=path,
            name="name",
        )

        dstore.store()
        assert path.exists()

        dstore = _Store.load(path=path)
        assert dstore.name == "name"
