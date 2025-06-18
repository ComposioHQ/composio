"""
Composio exceptions.
"""

import difflib
import typing as t

ENV_COMPOSIO_API_KEY = "COMPOSIO_API_KEY"


class ComposioError(Exception):
    """Base composio SDK error."""

    def __init__(
        self,
        message: str,
        *args: t.Any,
        delegate: bool = False,
    ) -> None:
        """
        Initialize Composio SDK error.

        :param message: Error message
        :param delegate: Whether to delegate the error message to the log
                        collection server or not
        """
        super().__init__(message, *args)
        self.message = message
        self.delegate = delegate


class NotFoundError(ComposioError):
    pass


class HTTPError(ComposioError):
    """
    Exception class for HTTP API errors.
    """

    def __init__(
        self,
        message: str,
        status_code: int,
        *args: t.Any,
        delegate: bool = False,
    ) -> None:
        """
        Initialize HTTPError class.

        :param message: Content from the API response
        :param status_code: HTTP response status code
        :param delegate: Whether to delegate the error message to the log
                        collection server or not
        """
        super().__init__(message, *args, delegate=delegate)
        self.status_code = status_code


class ComposioClientError(ComposioError):
    """
    Exception class for Composio client errors.
    """


class SDKError(ComposioError):
    pass


class ProcessorError(SDKError):
    pass


class EnumError(ComposioError):
    pass


class ValidationError(ComposioError):
    pass


class ToolkitError(ComposioError):
    pass


class EntityIDError(ComposioError):
    pass


class PluginError(ComposioError):
    pass


class InvalidParams(ComposioError):
    pass


class FileError(ComposioError):
    pass


class ComposioSDKTimeoutError(ComposioError, TimeoutError):
    pass


class SDKFileNotFoundError(ComposioError, FileNotFoundError):
    pass


class LockFileError(ComposioError):
    pass


class VersionError(ComposioError):
    pass


class InvalidLockFile(LockFileError):
    pass


class InvalidVersionString(EnumError):
    pass


class VersionSelectionError(LockFileError, VersionError):
    def __init__(
        self,
        action: str,
        requested: str,
        locked: str,
        delegate: bool = False,
    ) -> None:
        self.action = action
        self.requested = requested
        self.locked = locked
        super().__init__(
            message=(
                f"Error selecting version for action: {action!r}, "
                f"requested: {requested!r}, locked: {locked!r}"
            ),
            delegate=delegate,
        )


class InvalidEnum(EnumError):
    pass


class EnumStringNotFound(EnumError):
    """Raise when user provides invalid enum string."""

    def __init__(self, value: str, enum: str, possible_values: t.List[str]) -> None:
        error_message = f"Invalid value `{value}` for enum class `{enum}`"
        matches = difflib.get_close_matches(value, possible_values, n=1)
        if matches:
            (match,) = matches
            error_message += f". Did you mean {match!r}?"

        super().__init__(message=error_message)


class EnumMetadataNotFound(EnumError):
    pass


class ErrorUploadingFile(FileError):
    pass


class ErrorDownloadingFile(FileError):
    pass


class TriggerError(ToolkitError):
    pass


class ActionError(ToolkitError):
    pass


class TriggerSubscriptionError(TriggerError, ComposioClientError):
    pass


class InvalidTriggerFilters(TriggerSubscriptionError):
    pass


class ApiKeyError(ComposioClientError):
    pass


class ApiKeyNotProvidedError(ApiKeyError, NotFoundError):
    """Raise when API key is required but not provided."""

    def __init__(self) -> None:
        super().__init__(
            message=(
                "API Key not provided, either provide API key "
                f"or export it as `{ENV_COMPOSIO_API_KEY}` "
                "or run `composio login`"
            ),
        )


class ResourceError(ComposioClientError):
    pass


class NoItemsFound(ResourceError):
    """
    Exception class for empty collection values.
    """


class ErrorFetchingResource(ResourceError):
    pass


class SchemaError(ToolkitError):
    pass


class InvalidSchemaError(SchemaError, TypeError):
    pass


class InvalidEntityIdError(EntityIDError, ValueError):
    pass


class IntegrationError(ResourceError):
    pass


class ConnectedAccountError(ResourceError):
    pass


class ConnectedAccountNotFoundError(NotFoundError, ConnectedAccountError):
    pass


class InvalidConnectedAccount(ValidationError, ConnectedAccountError):
    pass


class ErrorProcessingToolExecutionRequest(PluginError):
    pass


class DescopeAuthError(ComposioError):
    pass


class DescopeConfigError(ComposioError):
    pass


class InvalidExecuteFunctionError(ComposioError):
    pass


class ToolNotFoundError(ComposioError):
    pass


class InvalidModifier(ComposioError):
    pass


class ExecuteToolFnNotSetError(ComposioError):
    pass


class UsageError(ComposioError):
    pass
