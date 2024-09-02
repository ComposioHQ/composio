"""Python package helpers."""

from importlib.metadata import PackageNotFoundError, metadata


def check_if_package_is_intalled(name: str) -> bool:
    try:
        return bool(metadata(name))
    except PackageNotFoundError:
        return False
