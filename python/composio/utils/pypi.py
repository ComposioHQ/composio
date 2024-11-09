"""Python package helpers."""

from importlib.metadata import PackageNotFoundError, metadata


_installed = set()


def check_if_package_is_intalled(name: str) -> bool:
    try:
        return name in _installed or bool(metadata(name))
    except PackageNotFoundError:
        return False


def add_package_to_installed_list(name: str):
    _installed.add(name)


# This for testing purposes
def reset_installed_list():
    _installed.clear()
