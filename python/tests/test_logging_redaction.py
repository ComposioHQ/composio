import io
import logging

from composio.utils.logging import _VerbosityWrapper


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
