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


class JSONSchemaRefResolutionError(ValidationError):
    """Raised when an internal JSON Schema ``$ref`` cannot be inlined.

    Covers malformed pointers, missing ``$defs``/``definitions`` targets
    (strict mode only), and ``$ref`` chains or node nesting that exceed the
    safety caps in :func:`composio.utils.json_schema.dereference_json_schema`.
    """

    def __init__(
        self,
        message: str,
        *args: t.Any,
        meta: t.Optional[t.Dict[str, t.Any]] = None,
        delegate: bool = False,
    ) -> None:
        super().__init__(message, *args, delegate=delegate)
        self.meta = meta or {}


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


class SensitiveFilePathBlockedError(FileError):
    """Raised when a local file path is refused before upload (sensitive directory or credential-like name)."""


class FileUploadPathNotAllowedError(FileError):
    """
    Raised when automatic file upload during tool execution is attempted from a
    path outside the configured ``file_upload_dirs`` allowlist.

    Only fires for auto-upload (enabled via
    ``dangerously_allow_auto_upload_download_files=True``). Manual upload APIs
    are not subject to this check.
    """


class FileUploadAbortedError(FileError):
    """Raised when a ``before_file_upload`` hook returns ``False``."""


class ErrorDownloadingFile(FileError):
    pass


class RemoteFileDownloadError(FileError):
    """Raised when fetching a remote file from a tool router session mount fails.

    Includes HTTP status, URL, and file path context for debugging.
    """

    def __init__(
        self,
        message: str = "Failed to download remote file",
        *,
        status_code: t.Optional[int] = None,
        status_text: t.Optional[str] = None,
        download_url: t.Optional[str] = None,
        mount_relative_path: t.Optional[str] = None,
        filename: t.Optional[str] = None,
        **kwargs: t.Any,
    ) -> None:
        super().__init__(message, **kwargs)
        self.status_code = status_code
        self.status_text = status_text
        self.download_url = download_url
        self.mount_relative_path = mount_relative_path
        self.filename = filename


class ResponseTooLargeError(FileError):
    """Raised when a response exceeds the maximum allowed size."""

    pass


class TriggerError(ToolkitError):
    pass


class WebhookSignatureVerificationError(TriggerError):
    """Raised when webhook signature verification fails."""

    pass


class WebhookPayloadError(TriggerError):
    """Raised when webhook payload is invalid."""

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


class ComposioMultipleConnectedAccountsError(ConnectedAccountError):
    """Raised when multiple connected accounts are found for a user and auth config."""

    pass


class ComposioLegacyConnectedAccountsEndpointRetiredError(ConnectedAccountError):
    """Raised by ``composio.connected_accounts.initiate()`` when the legacy
    ``POST /api/v3/connected_accounts`` endpoint rejects a Composio-managed
    OAuth (OAuth1, OAuth2, DCR_OAUTH) auth-config request.

    Cutover dates: 2026-05-08 (new orgs), 2026-07-03 (all remaining orgs).
    Migrate to ``composio.connected_accounts.link()`` — same return shape,
    works for every redirectable scheme regardless of whether the auth
    config is Composio-managed or custom.

    See: https://docs.composio.dev/docs/changelog/2026/04/24
    """

    pass


class ComposioAclOnlyForSharedError(ConnectedAccountError):
    """Raised when ACL fields (``allow_all_users``, ``allowed_user_ids``,
    ``not_allowed_user_ids``) are sent on a ``PRIVATE`` connection. ACL
    is only meaningful for ``SHARED`` connections.

    Fix: use ``account_type='SHARED'``, or omit the ACL fields when
    creating/updating a PRIVATE connection.
    """

    pass


class ComposioSharedAccessDeniedError(ConnectedAccountError):
    """Raised when a tool execution attempts to use a SHARED connected
    account but the requesting ``user_id`` is not allowed by the
    connection's ACL.

    Surfaces when a SHARED connection is reached directly (e.g. via
    ``composio.tools.execute(slug, connected_account_id=...)``) without
    going through a tool-router session.

    Fix: ask the connection's creator to grant access via
    ``composio.experimental.update_acl()`` — set ``allow_all_users``,
    add the ``user_id`` to ``allowed_user_ids``, or remove it from
    ``not_allowed_user_ids``.
    """

    pass


class ComposioSharedConnectionNotAccessibleError(ConnectedAccountError):
    """Raised by ``tool_router.session.create()`` / ``session.patch()``
    when the session's ``user_id`` cannot use a pinned SHARED connection.
    Raised at session-create time so the session never enters a state
    that fails mid-execution.

    Fix: grant the session user access via
    ``composio.experimental.update_acl()`` on the pinned connection,
    or pin a different connection the user can use.
    """

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


class ToolVersionRequiredError(ComposioError):
    """Raised when toolkit version is not specified for manual tool execution."""

    def __init__(self) -> None:
        super().__init__(
            message=(
                "Toolkit version not specified. For manual execution of the tool "
                "please pass a specific toolkit version.\n\n"
                "Possible fixes:\n"
                "1. Pass the toolkit version as a parameter to the execute function "
                '("latest" is not supported in manual execution)\n'
                "2. Set the toolkit versions in the Composio config "
                "(toolkit_versions={'<toolkit-slug>': '<toolkit-version>'})\n"
                "3. Set the toolkit version in the environment variable "
                "(COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_SLUG>)\n"
                "4. Set dangerously_skip_version_check to True "
                "(this might cause unexpected behavior when new versions of the tools are released)"
            ),
        )


class UsageError(ComposioError):
    pass
