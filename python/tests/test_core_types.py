"""Test core types module."""

from composio.core.types import (
    ToolkitLatestVersion,
    ToolkitVersion,
    ToolkitVersions,
)


class TestCoreTypes:
    """Test cases for core types."""

    def test_toolkit_latest_version_literal(self):
        """Test ToolkitLatestVersion is a literal type."""
        # Should be a Literal["latest"]
        assert hasattr(ToolkitLatestVersion, "__origin__")

    def test_toolkit_version_is_union(self):
        """Test ToolkitVersion is a Union type."""
        # ToolkitVersion should be Union[Literal["latest"], str]
        import typing

        assert hasattr(ToolkitVersion, "__origin__")
        assert ToolkitVersion.__origin__ is typing.Union

    def test_toolkit_versions_is_dict(self):
        """Test ToolkitVersions is dict type."""
        # Should be Dict[str, ToolkitVersion]
        assert hasattr(ToolkitVersions, "__origin__")
        assert ToolkitVersions.__origin__ is dict

    def test_all_types_exported(self):
        """Test that all types are properly exported."""
        from composio.core.types import __all__

        expected_exports = {
            "ToolkitLatestVersion",
            "ToolkitVersion",
            "ToolkitVersions",
            "ToolkitVersionParam",
        }

        assert set(__all__) == expected_exports

    def test_types_importable_from_main_package(self):
        """Test that types are importable from main package."""
        from composio import (
            ToolkitLatestVersion,
            ToolkitVersion,
            ToolkitVersionParam,
            ToolkitVersions,
        )

        # Should be the same objects
        from composio.core.types import (
            ToolkitLatestVersion as CoreToolkitLatestVersion,
        )
        from composio.core.types import (
            ToolkitVersion as CoreToolkitVersion,
        )
        from composio.core.types import (
            ToolkitVersionParam as CoreToolkitVersionParam,
        )
        from composio.core.types import (
            ToolkitVersions as CoreToolkitVersions,
        )

        assert ToolkitLatestVersion is CoreToolkitLatestVersion
        assert ToolkitVersion is CoreToolkitVersion
        assert ToolkitVersionParam is CoreToolkitVersionParam
        assert ToolkitVersions is CoreToolkitVersions

    def test_types_importable_from_types_module(self):
        """Test that types are importable from types module."""
        # Should be the same objects as core types
        from composio.core.types import (
            ToolkitLatestVersion as CoreToolkitLatestVersion,
        )
        from composio.core.types import (
            ToolkitVersion as CoreToolkitVersion,
        )
        from composio.core.types import (
            ToolkitVersionParam as CoreToolkitVersionParam,
        )
        from composio.core.types import (
            ToolkitVersions as CoreToolkitVersions,
        )
        from composio.types import (
            ToolkitLatestVersion,
            ToolkitVersion,
            ToolkitVersionParam,
            ToolkitVersions,
        )

        assert ToolkitLatestVersion is CoreToolkitLatestVersion
        assert ToolkitVersion is CoreToolkitVersion
        assert ToolkitVersionParam is CoreToolkitVersionParam
        assert ToolkitVersions is CoreToolkitVersions
