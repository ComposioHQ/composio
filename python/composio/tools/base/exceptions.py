"""Tool exceptions."""

from composio.exceptions import ComposioSDKError


class ExecutionFailed(ComposioSDKError):
    """Execution failed."""

    def __init__(self, message: str, **kwargs) -> None:
        super().__init__(message)
        self.extra = kwargs
