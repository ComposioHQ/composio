"""Test configuration."""

import os
import typing as t
from pathlib import Path

import pytest


IS_CI = os.environ.get("CI") == "true"
E2E = pytest.mark.e2e
ROOT_DIR = Path(__file__).parent.parent


def skip_if_ci(reason: str) -> t.Callable:
    return pytest.mark.skipif(condition=IS_CI, reason=reason)
