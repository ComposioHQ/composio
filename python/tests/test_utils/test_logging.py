from logging import Logger
from unittest import mock

import pytest

from composio import ComposioToolSet


@pytest.mark.parametrize(
    ("verbosity", "size"),
    (
        (0, 256),
        (1, 512),
        (2, 1024),
        (3, 2045),
    ),
)
def test_log_verbosity(verbosity: int, size: int):
    def _assert(_, x):
        assert len(x) == size + 3

    toolset = ComposioToolSet(verbosity_level=verbosity)
    with mock.patch.object(Logger, "info", new=_assert):
        toolset.logger.info("-" * 2048)
