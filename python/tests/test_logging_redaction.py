import io
import logging

from composio.utils.logging import _VerbosityWrapper


class _CaptureHandler(logging.StreamHandler):
    def __init__(self, stream: io.StringIO) -> None:
        super().__init__(stream)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)
        super().emit(record)


class _TokenError(ValueError):
    def __init__(self, message: str, token: str | None = None) -> None:
        self.token = token
        super().__init__(message)


class _ConstructorSensitiveError(Exception):
    def __init__(self, key: str) -> None:
        super().__init__({"known": "api_key=constructor-secret"}[key])


def test_sdk_logger_redacts_structured_and_interpolated_credentials() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-credential-redaction")
    logger.handlers = [logging.StreamHandler(output)]
    logger.propagate = False
    logger.setLevel(logging.DEBUG)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    wrapped.debug("api_key=%s", "uak_test_secret")
    wrapped.error({"nested": {"access_token": "oauth_test_secret"}, "safe": "visible"})

    logged = output.getvalue()
    assert "uak_test_secret" not in logged
    assert "oauth_test_secret" not in logged
    assert "[REDACTED]" in logged
    assert "visible" in logged


def test_sdk_logger_redacts_extra_metadata_before_formatting() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-extra-redaction")
    handler = logging.StreamHandler(output)
    handler.setFormatter(
        logging.Formatter("%(message)s %(api_key)s %(context)s %(binary)s")
    )
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.INFO)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    wrapped.info(
        "request metadata",
        extra={
            "api_key": "uak_test_secret",
            "context": {"access_token": "oauth_test_secret", "safe": "visible"},
            "binary": b"api_key=binary_test_secret",
        },
    )

    logged = output.getvalue()
    assert "uak_test_secret" not in logged
    assert "oauth_test_secret" not in logged
    assert "binary_test_secret" not in logged
    assert logged.count("[REDACTED]") == 3
    assert "visible" in logged


def test_sdk_logger_redacts_errors_without_truncating_them() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-error-redaction")
    logger.handlers = [logging.StreamHandler(output)]
    logger.propagate = False
    logger.setLevel(logging.ERROR)
    wrapped = _VerbosityWrapper(logger, verbosity_level=0)

    wrapped.error("api_key=%s %s", "uak_test_secret", "tail" * 100)

    logged = output.getvalue()
    assert "uak_test_secret" not in logged
    assert "[REDACTED]" in logged
    assert logged.rstrip().endswith("tail")


def test_sdk_logger_redacts_exception_tracebacks() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-exception-redaction")
    handler = _CaptureHandler(output)
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.ERROR)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    try:
        raise RuntimeError("Authorization: Bearer oauth_test_secret")
    except RuntimeError:
        wrapped.error("request failed", exc_info=True)

    logged = output.getvalue()
    assert "oauth_test_secret" not in logged
    assert "Traceback (most recent call last)" in logged
    assert "RuntimeError" in logged
    assert "[REDACTED]" in logged
    assert handler.records[0].exc_info is not None
    assert isinstance(handler.records[0].exc_info[1], RuntimeError)
    assert "oauth_test_secret" not in str(handler.records[0].exc_info[1])


def test_sdk_logger_rebuilds_exception_metadata_without_original_state() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-exception-state-redaction")
    handler = _CaptureHandler(output)
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.ERROR)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)
    error = _TokenError("api_key=message_test_secret", "attribute_test_secret")
    error.add_note("password=note_test_secret")

    wrapped.error("request failed", exc_info=error)

    logged = output.getvalue()
    sanitized = handler.records[0].exc_info
    assert sanitized is not None
    assert sanitized[0] is _TokenError
    assert type(sanitized[1]) is _TokenError
    assert vars(sanitized[1]) == {}
    for secret in (
        "message_test_secret",
        "attribute_test_secret",
        "note_test_secret",
    ):
        assert secret not in logged
        assert secret not in str(sanitized[1])


def test_sdk_logger_falls_back_when_exception_type_cannot_be_rebuilt() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-exception-constructor-fallback")
    handler = _CaptureHandler(output)
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.ERROR)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    wrapped.error("request failed", exc_info=_ConstructorSensitiveError("known"))

    logged = output.getvalue()
    sanitized = handler.records[0].exc_info
    assert sanitized is not None
    assert sanitized[0] is RuntimeError
    assert isinstance(sanitized[1], RuntimeError)
    assert "constructor-secret" not in logged
    assert "constructor-secret" not in str(sanitized[1])


def test_sdk_logger_omits_arguments_when_placeholder_formatting_fails() -> None:
    output = io.StringIO()
    logger = logging.getLogger("composio-test-placeholder-redaction")
    logger.handlers = [logging.StreamHandler(output)]
    logger.propagate = False
    logger.setLevel(logging.INFO)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    wrapped.info("api_key=%d", "uak_test_secret")

    logged = output.getvalue()
    assert "uak_test_secret" not in logged
    assert "logging arguments omitted" in logged


def test_sdk_logger_tolerates_bad_placeholders_and_skips_disabled_levels() -> None:
    class RaisesOnString:
        def __str__(self) -> str:
            raise AssertionError("disabled log arguments must remain lazy")

    output = io.StringIO()
    logger = logging.getLogger("composio-test-logging-compatibility")
    logger.handlers = [logging.StreamHandler(output)]
    logger.propagate = False
    logger.setLevel(logging.INFO)
    wrapped = _VerbosityWrapper(logger, verbosity_level=3)

    wrapped.info("missing=%(missing)s", {"present": "safe"})
    wrapped.debug("api_key=%s", RaisesOnString())

    assert "missing" in output.getvalue()
