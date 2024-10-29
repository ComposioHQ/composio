"""
Composio API server HTTP endpoints.
"""

import typing as t
import urllib.parse


class Endpoint:
    """
    HTTP Endpoint object.

    Example:
        >>> v1 = Endpoint("v1")
        >>> print(v1)
        /v1
        >>> v1 / "api" / "users"
        /v1/api/users
        >>> v1.api.users
        /v1/api/users
        >>> v1.api.users(queries={"user": "John Doe"})
        /v1/api/users?user=John+Doe
    """

    def __init__(self, endpoint: t.Optional[str] = None) -> None:
        """
        Initialize HTTP Endpoint object.
        """
        endpoint = endpoint or ""
        if not endpoint.startswith("/"):
            endpoint = f"/{endpoint}"
        self.endpoint = endpoint

    def __str__(self) -> str:
        """String representation of the endpoint."""
        return self.endpoint

    __repr__ = __str__

    def __getattribute__(self, name: str) -> "Endpoint":
        """Get attribute."""
        try:
            return super().__getattribute__(name)
        except AttributeError:
            name = name.replace("_", "-")
            return Endpoint(f"{self.endpoint}/{name}")

    def __truediv__(self, other: t.Union[str, "Endpoint"]) -> "Endpoint":
        """Returns"""
        if isinstance(other, Endpoint):
            return Endpoint(f"{self.endpoint}/{other.endpoint}")
        return Endpoint(f"{self.endpoint}/{other}")

    def __call__(self, queries: t.Dict[str, str]) -> "Endpoint":
        """Returns endpoint object with query params."""
        if len(queries) == 0:
            return self

        return Endpoint(
            urllib.parse.urljoin(self.endpoint, "?" + urllib.parse.urlencode(queries))
        )


class _V1(Endpoint):
    """
    Endpoint: /v1
    """

    class _CLI(Endpoint):
        """
        Endpoint /v1/cli
        """

        generate_cli_session: Endpoint
        verify_cli_code: Endpoint

    class _Apps(Endpoint):
        """
        Endpoint /v1/apps
        """

    class _Actions(Endpoint):
        """
        Endpoint /v1/actions
        """

    class _Triggers(Endpoint):
        """
        Endpoint /v1/triggers
        """

        class _Enable(Endpoint):
            """
            Endpoint /v1/triggers/enable
            """

        class _Disable(Endpoint):
            """
            Endpoint /v1/triggers/disable
            """

        enable: _Enable
        disable: _Disable

    class _Integrations(Endpoint):
        """
        Endpoint /v1/integrations
        """

    cli: _CLI
    apps: _Apps
    actions: _Actions
    triggers: _Triggers
    integrations: _Integrations


class _V2(Endpoint):
    """
    Endpoint: /v1
    """

    class _Actions(Endpoint):
        """
        Endpoint /v1/actions
        """

    class _Triggers(Endpoint):
        """
        Endpoint /v1/triggers
        """

    triggers: _Triggers
    actions: _Actions


v1 = _V1(endpoint="v1")
v2 = _V2(endpoint="v2")
