"""SDK-owned logging and deprecation surface.

``Composio(...)`` accepts ``logger`` / ``logging_level`` and routes the
generated ``composio_client`` logger through the SDK's redacting wrapper.
Runtime deprecations (the client's response-driven ones and the SDK's own)
all surface as :class:`ComposioDeprecationWarning`.
"""

import io
import logging
import typing as t
import warnings

import httpx
import pytest

from composio import Composio, ComposioDeprecationWarning, exceptions
from composio.client import (
    CLIENT_LOGGER_NAME,
    _ClientLogForwarder,
    _forwarding_wrappers,
)
from composio.core.models.base import allow_tracking
from composio.utils.logging import LogLevel

_LIST_BODY: dict[str, t.Any] = {
    "items": [],
    "next_cursor": None,
    "total_pages": 1,
    "current_page": 1,
    "total_items": 0,
}


@pytest.fixture(autouse=True)
def disable_telemetry():
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


@pytest.fixture(autouse=True)
def reset_client_logger():
    """Start each test without the forwarder state earlier tests left behind.

    The forwarder and the set of live wrappers are process-wide, so a DEBUG
    instance from an earlier test would otherwise keep the client logger
    permissive and mask level assertions here.
    """
    client_logger = logging.getLogger(CLIENT_LOGGER_NAME)
    for handler in list(client_logger.handlers):
        if isinstance(handler, _ClientLogForwarder):
            client_logger.removeHandler(handler)
    _forwarding_wrappers.clear()
    client_logger.setLevel(logging.NOTSET)
    yield


@pytest.fixture
def custom_logger() -> t.Iterator[tuple[logging.Logger, io.StringIO]]:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-sdk-owned-logger")
    logger.handlers = [logging.StreamHandler(output)]
    logger.propagate = False
    logger.setLevel(logging.DEBUG)
    yield logger, output
    logger.handlers = []


def _mock_transport(
    headers: t.Optional[dict[str, str]] = None,
    seen: t.Optional[list[httpx.Request]] = None,
) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(200, json=_LIST_BODY, headers=headers or {})

    return httpx.Client(transport=httpx.MockTransport(handler))


def _forwarders() -> list[_ClientLogForwarder]:
    return [
        handler
        for handler in logging.getLogger(CLIENT_LOGGER_NAME).handlers
        if isinstance(handler, _ClientLogForwarder)
    ]


class TestCustomLogger:
    def test_sdk_logs_use_custom_logger_with_redaction(self, custom_logger):
        logger, output = custom_logger
        composio = Composio(api_key="test-key", logger=logger)

        assert composio.logger.logger is logger
        composio.logger.info("sdk record api_key=sdk-secret")

        text = output.getvalue()
        assert "sdk record" in text
        assert "sdk-secret" not in text
        assert "[REDACTED]" in text

    def test_client_records_are_forwarded_with_redaction(self, custom_logger):
        logger, output = custom_logger
        Composio(api_key="test-key", logger=logger)

        logging.getLogger(CLIENT_LOGGER_NAME).info(
            "Authorization: Bearer client-secret-token"
        )

        text = output.getvalue()
        assert "Authorization" in text
        assert "client-secret-token" not in text
        assert "[REDACTED]" in text

    def test_client_request_lifecycle_reaches_custom_logger(self, custom_logger):
        logger, output = custom_logger
        composio = Composio(
            api_key="test-key", http_client=_mock_transport(), logger=logger
        )

        composio.client.toolkits.list()

        text = output.getvalue()
        assert "path=/api/v3.1/toolkits" in text
        assert "status=200" in text

    def test_client_request_lifecycle_stays_out_of_info(self, custom_logger):
        logger, output = custom_logger
        logger.setLevel(logging.INFO)
        composio = Composio(
            api_key="test-key", http_client=_mock_transport(), logger=logger
        )

        composio.client.toolkits.list()

        assert logging.getLogger(CLIENT_LOGGER_NAME).level == logging.WARNING
        assert "path=/api/v3.1/toolkits" not in output.getvalue()

    def test_without_retries_clone_keeps_custom_logger(self, custom_logger):
        logger, output = custom_logger
        composio = Composio(
            api_key="test-key", http_client=_mock_transport(), logger=logger
        )

        composio.client.without_retries.toolkits.list()

        forwarders = _forwarders()
        assert len(forwarders) == 1
        assert forwarders[0].wrapper.logger is logger
        assert "path=/api/v3.1/toolkits" in output.getvalue()

    def test_client_logger_does_not_propagate_to_root(self, custom_logger):
        logger, _ = custom_logger
        Composio(api_key="test-key", logger=logger)

        client_logger = logging.getLogger(CLIENT_LOGGER_NAME)
        assert client_logger.propagate is False

    def test_forwarder_is_installed_once_per_logger(self, custom_logger):
        logger, _ = custom_logger
        Composio(api_key="test-key", logger=logger)
        Composio(api_key="test-key", logger=logger)

        forwarders = _forwarders()
        assert len(forwarders) == 1
        assert forwarders[0].wrapper.logger is logger

    def test_client_records_follow_the_requesting_instance(self, custom_logger):
        logger, output = custom_logger
        other = logging.getLogger("composio-test-sdk-owned-logger-other")
        other_output = io.StringIO()
        other.handlers = [logging.StreamHandler(other_output)]
        other.propagate = False
        other.setLevel(logging.DEBUG)
        try:
            first = Composio(
                api_key="test-key", http_client=_mock_transport(), logger=other
            )
            second = Composio(
                api_key="test-key", http_client=_mock_transport(), logger=logger
            )
            assert len(_forwarders()) == 1

            # A request through the earlier instance still logs to its own
            # logger, even though a newer instance was constructed since.
            first.client.without_retries.toolkits.list()
            assert "path=/api/v3.1/toolkits" in other_output.getvalue()
            assert "path=/api/v3.1/toolkits" not in output.getvalue()

            second.client.without_retries.toolkits.list()
            assert "path=/api/v3.1/toolkits" in output.getvalue()

            # Outside any request, records go to the most recent instance.
            logging.getLogger(CLIENT_LOGGER_NAME).info("delivered once")
            assert "delivered once" in output.getvalue()
            assert "delivered once" not in other_output.getvalue()
        finally:
            other.handlers = []

    def test_quieter_instance_does_not_silence_earlier_debug_instance(
        self, custom_logger
    ):
        logger, output = custom_logger
        quiet = logging.getLogger("composio-test-sdk-owned-logger-quiet")
        quiet_output = io.StringIO()
        quiet.handlers = [logging.StreamHandler(quiet_output)]
        quiet.propagate = False
        quiet.setLevel(logging.WARNING)
        try:
            debug_instance = Composio(
                api_key="test-key", http_client=_mock_transport(), logger=logger
            )
            quiet_instance = Composio(
                api_key="test-key", http_client=_mock_transport(), logger=quiet
            )
            # The shared source logger stays permissive enough for the DEBUG
            # instance; the quiet instance's wrapper filters its own output.
            assert logging.getLogger(CLIENT_LOGGER_NAME).level == logging.DEBUG

            debug_instance.client.without_retries.toolkits.list()
            assert "path=/api/v3.1/toolkits" in output.getvalue()

            quiet_instance.client.without_retries.toolkits.list()
            assert "path=/api/v3.1/toolkits" not in quiet_output.getvalue()
        finally:
            quiet.handlers = []

    def test_debug_instance_lowers_level_set_by_earlier_quiet_instance(
        self, custom_logger
    ):
        logger, output = custom_logger
        quiet = logging.getLogger("composio-test-sdk-owned-logger-quiet")
        quiet.handlers = [logging.StreamHandler(io.StringIO())]
        quiet.propagate = False
        quiet.setLevel(logging.WARNING)
        try:
            Composio(api_key="test-key", http_client=_mock_transport(), logger=quiet)
            assert logging.getLogger(CLIENT_LOGGER_NAME).level == logging.WARNING

            debug_instance = Composio(
                api_key="test-key", http_client=_mock_transport(), logger=logger
            )
            assert logging.getLogger(CLIENT_LOGGER_NAME).level == logging.DEBUG

            debug_instance.client.without_retries.toolkits.list()
            assert "path=/api/v3.1/toolkits" in output.getvalue()
        finally:
            quiet.handlers = []


class TestLoggingLevel:
    def test_logging_level_applies_to_sdk_and_client_loggers(self, custom_logger):
        logger, output = custom_logger
        composio = Composio(
            api_key="test-key", logger=logger, logging_level=LogLevel.WARNING
        )

        assert logger.level == logging.WARNING
        assert logging.getLogger(CLIENT_LOGGER_NAME).level == logging.WARNING
        assert composio._logging_level == "WARNING"

        composio.logger.info("sdk info dropped")
        logging.getLogger(CLIENT_LOGGER_NAME).info("client info dropped")
        composio.logger.warning("sdk warning kept")
        logging.getLogger(CLIENT_LOGGER_NAME).warning("client warning kept")

        text = output.getvalue()
        assert "dropped" not in text
        assert "sdk warning kept" in text
        assert "client warning kept" in text

    def test_logging_level_debug_enables_debug_records(self, custom_logger):
        logger, output = custom_logger
        logger.setLevel(logging.WARNING)
        composio = Composio(
            api_key="test-key", logger=logger, logging_level=LogLevel.DEBUG
        )

        composio.logger.debug("sdk debug kept")
        logging.getLogger(CLIENT_LOGGER_NAME).debug("client debug kept")

        text = output.getvalue()
        assert "sdk debug kept" in text
        assert "client debug kept" in text


class TestDeprecationWarnings:
    def test_category_is_re_exported(self):
        assert exceptions.ComposioDeprecationWarning is ComposioDeprecationWarning
        assert issubclass(ComposioDeprecationWarning, UserWarning)
        assert not issubclass(ComposioDeprecationWarning, DeprecationWarning)

    def test_client_deprecation_header_reaches_caller(self, custom_logger):
        logger, _ = custom_logger
        composio = Composio(
            api_key="test-key",
            http_client=_mock_transport(headers={"Deprecation": "@1688169599"}),
            logger=logger,
        )

        with pytest.warns(ComposioDeprecationWarning, match="toolkits.list"):
            composio.client.toolkits.list()

    def test_no_warning_without_deprecation_header(self, custom_logger):
        logger, _ = custom_logger
        composio = Composio(
            api_key="test-key", http_client=_mock_transport(), logger=logger
        )

        with warnings.catch_warnings():
            warnings.simplefilter("error", ComposioDeprecationWarning)
            composio.client.toolkits.list()

    def test_tool_router_alias_warns_with_sdk_category(self):
        composio = Composio(api_key="test-key")

        with pytest.warns(ComposioDeprecationWarning, match="tool_router"):
            alias = composio.tool_router

        assert alias is composio.sessions


class TestToolsListWireParams:
    def test_search_is_sent_as_query(self, custom_logger):
        logger, _ = custom_logger
        seen: list[httpx.Request] = []
        composio = Composio(
            api_key="test-key", http_client=_mock_transport(seen=seen), logger=logger
        )

        with warnings.catch_warnings():
            warnings.simplefilter("error", ComposioDeprecationWarning)
            composio.tools.get_raw_composio_tools(search="github issues")

        assert len(seen) == 1
        params = seen[0].url.params
        assert params["query"] == "github issues"
        assert "search" not in params
