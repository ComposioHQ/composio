"""Security tests for the legacy ``CustomTool`` / ``CustomTools`` API.

Regression tests for SEC-365 (CWE-639, cross-tenant credential access).

Before the fix, ``CustomTool.__call__`` extracted ``user_id`` from the same
``**kwargs`` dict that carried LLM-supplied tool arguments, and
``CustomTools.execute`` happily forwarded that LLM-controlled dict via
``custom_tool(**request, user_id=user_id)``. An LLM (or prompt-injection
input) could therefore set ``user_id`` to another tenant's identifier and
have ``CustomTool.__get_auth_credentials`` look up that victim's OAuth
tokens.

After the fix:
    * ``CustomTools.execute`` filters the LLM-supplied ``request`` through
      an *allowlist* of fields declared on the tool's Pydantic
      ``request_model`` — ``user_id`` and any other unexpected key are
      dropped before they can influence credential lookup or reach the
      tool's execute function.
    * ``CustomTool.invoke_trusted`` is the structurally separate trusted
      entry point; ``user_id`` cannot be smuggled inside ``request_kwargs``.
    * ``CustomTool.__call__`` raises ``TypeError`` if ``user_id`` appears
      in ``kwargs`` rather than silently using a fallback.
"""

from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel, Field

from composio.core.models.custom_tools import CustomTool, CustomTools
from composio.exceptions import NotFoundError


class _IssueInput(BaseModel):
    issue_number: int = Field(description="GitHub issue number")


@pytest.fixture
def mock_http_client() -> MagicMock:
    """Mock HttpClient that returns a single connected account on lookup."""
    state = MagicMock()
    state.val.model_dump.return_value = {"access_token": "trusted-token"}

    account = MagicMock()
    account.created_at = "2026-01-01T00:00:00Z"
    account.state = state

    response = MagicMock()
    response.items = [account]

    client = MagicMock()
    client.connected_accounts.list.return_value = response
    client.tools.proxy = MagicMock()
    return client


@pytest.fixture
def github_tool(mock_http_client: MagicMock) -> CustomTool:
    """A registered ``github`` custom tool whose handler echoes the auth token."""

    def github_tool(request: _IssueInput, execute_request, auth_credentials):
        """Fetch issue info."""
        return {
            "issue_number": request.issue_number,
            "token": auth_credentials["access_token"],
        }

    return CustomTool(f=github_tool, client=mock_http_client, toolkit="github")


@pytest.fixture
def custom_tools(mock_http_client: MagicMock, github_tool: CustomTool) -> CustomTools:
    """A ``CustomTools`` registry pre-loaded with ``github_tool``."""
    tools = CustomTools(client=mock_http_client)
    tools.custom_tools_registry[github_tool.slug] = github_tool
    return tools


def test_execute_strips_user_id_from_llm_request(
    mock_http_client: MagicMock, custom_tools: CustomTools, github_tool: CustomTool
) -> None:
    """``CustomTools.execute`` MUST drop ``user_id`` from the request dict."""
    result = custom_tools.execute(
        slug=github_tool.slug,
        request={"issue_number": 1, "user_id": "victim-user"},
        user_id="trusted-user",
    )

    assert result == {"issue_number": 1, "token": "trusted-token"}
    mock_http_client.connected_accounts.list.assert_called_once_with(
        toolkit_slugs=["github"],
        user_ids=["trusted-user"],
    )


def test_execute_strips_unexpected_fields_via_allowlist(
    mock_http_client: MagicMock, custom_tools: CustomTools, github_tool: CustomTool
) -> None:
    """The allowlist is durable: any non-declared key is dropped, not just user_id.

    Pins the allowlist behaviour so a future identity-bearing key in the
    auth path (``tenant_id``, ``org_id``, ``connected_account_id``, …)
    cannot re-introduce CWE-639 by being smuggled through ``request``.
    """
    captured: dict = {}

    def echo_tool(request: _IssueInput, execute_request, auth_credentials):
        """Echo back the validated request."""
        captured["fields"] = request.model_dump()
        return {"ok": True}

    tools = CustomTools(client=mock_http_client)
    tool = CustomTool(f=echo_tool, client=mock_http_client, toolkit="github")
    tools.custom_tools_registry[tool.slug] = tool

    tools.execute(
        slug=tool.slug,
        request={
            "issue_number": 1,
            "user_id": "victim-user",
            "tenant_id": "evil-tenant",
            "connected_account_id": "ca_evil",
            "extra_garbage": "xyz",
        },
        user_id="trusted-user",
    )

    assert captured["fields"] == {"issue_number": 1}
    mock_http_client.connected_accounts.list.assert_called_once_with(
        toolkit_slugs=["github"],
        user_ids=["trusted-user"],
    )


def test_execute_keeps_aliases_declared_on_request_model(
    mock_http_client: MagicMock,
) -> None:
    """Aliases declared on the request model are honoured by the allowlist."""

    class _AliasedInput(BaseModel):
        issue_number: int = Field(alias="issueNumber")

    captured: dict = {}

    def aliased_tool(request: _AliasedInput, execute_request, auth_credentials):
        """Echo back the validated request."""
        captured["fields"] = request.model_dump()
        return {"ok": True}

    tools = CustomTools(client=mock_http_client)
    tool = CustomTool(f=aliased_tool, client=mock_http_client, toolkit="github")
    tools.custom_tools_registry[tool.slug] = tool

    tools.execute(
        slug=tool.slug,
        request={"issueNumber": 5, "user_id": "victim"},
        user_id="trusted-user",
    )

    assert captured["fields"] == {"issue_number": 5}


def test_execute_falls_back_to_default_when_user_id_missing(
    mock_http_client: MagicMock, custom_tools: CustomTools, github_tool: CustomTool
) -> None:
    """If no trusted ``user_id`` is provided, ``execute`` MUST use ``"default"``.

    Specifically, ``execute`` MUST NOT silently use the LLM-supplied
    ``user_id`` from ``request`` as a fallback — that would re-introduce
    SEC-365 under a different code path.
    """
    custom_tools.execute(
        slug=github_tool.slug,
        request={"issue_number": 1, "user_id": "victim-user"},
        user_id=None,
    )

    mock_http_client.connected_accounts.list.assert_called_once_with(
        toolkit_slugs=["github"],
        user_ids=["default"],
    )


def test_execute_does_not_mutate_caller_request_dict(
    custom_tools: CustomTools, github_tool: CustomTool
) -> None:
    """Sanitization MUST NOT mutate the caller's ``request`` dict in place."""
    request_dict = {"issue_number": 1, "user_id": "victim-user"}
    custom_tools.execute(
        slug=github_tool.slug,
        request=request_dict,
        user_id="trusted-user",
    )

    assert request_dict == {"issue_number": 1, "user_id": "victim-user"}


def test_call_raises_typeerror_when_user_id_smuggled_in_kwargs(
    github_tool: CustomTool,
) -> None:
    """``CustomTool.__call__`` MUST refuse a ``user_id`` kwarg loudly.

    Silent fallbacks expand blast radius: a tool that quietly transacts
    against ``"default"`` could end up using a real tenant who happens to
    be registered under that id. Failing fast also surfaces prompt-injection
    attempts instead of swallowing them.
    """
    smuggled_kwargs = {"issue_number": 1, "user_id": "victim-user"}

    with pytest.raises(TypeError, match="user_id"):
        github_tool(**smuggled_kwargs)


def test_invoke_trusted_uses_explicit_user_id_over_smuggled_one(
    mock_http_client: MagicMock, github_tool: CustomTool
) -> None:
    """``invoke_trusted``'s explicit ``user_id`` MUST win over a smuggled key.

    The auth-path argument is structurally separate from ``request_kwargs``,
    so an LLM-controlled ``user_id`` inside ``request_kwargs`` cannot
    override the trusted parameter. This pins the docstring contract.
    """
    github_tool.invoke_trusted(
        user_id="trusted-user",
        request_kwargs={"issue_number": 7, "user_id": "victim-user"},
    )

    mock_http_client.connected_accounts.list.assert_called_once_with(
        toolkit_slugs=["github"],
        user_ids=["trusted-user"],
    )


def test_execute_unknown_slug_raises(custom_tools: CustomTools) -> None:
    """Sanity check: unknown slugs still surface ``NotFoundError``."""
    with pytest.raises(NotFoundError):
        custom_tools.execute(
            slug="DOES_NOT_EXIST",
            request={"foo": "bar"},
            user_id="trusted-user",
        )


def test_tools_execute_e2e_strips_user_id_through_full_stack(
    mock_http_client: MagicMock, custom_tools: CustomTools, github_tool: CustomTool
) -> None:
    """End-to-end check through ``Tools.execute`` (the public SDK entry point).

    ``Tools._execute_tool`` routes custom-tool calls into
    ``CustomTools.execute``. The modifier-hook block can also overwrite
    ``arguments`` and ``user_id`` from a ``processed_params`` dict, so we
    pin that the sanitization still applies after that path.
    """
    from composio.core.models.tools import Tools

    provider = MagicMock()
    provider.name = "test"

    tools = Tools(client=mock_http_client, provider=provider)
    tools._custom_tools = custom_tools

    response = tools.execute(
        slug=github_tool.slug,
        arguments={"issue_number": 1, "user_id": "victim-user"},
        user_id="trusted-user",
    )

    assert response["successful"] is True
    assert response["data"]["issue_number"] == 1
    assert response["data"]["token"] == "trusted-token"
    mock_http_client.connected_accounts.list.assert_called_once_with(
        toolkit_slugs=["github"],
        user_ids=["trusted-user"],
    )


# ────────────────────────────────────────────────────────────────
# PLEN-2345: explicit ``connected_account_id`` plumbing
#
# Before PLEN-2345 ``connected_account_id`` was silently dropped on the
# custom-tool path: ``Tools._execute_custom_tool`` did not accept it, and
# ``execute_request`` was a bare reference to ``client.tools.proxy`` with
# no auth context bound — so every proxy call from a custom tool 400'd
# with ``ExternalProxy_MissingAuthContext`` after the backend stopped
# accepting empty-auth proxies. The pins below cover the new contract.
# ────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_http_client_with_retrieve(mock_http_client: MagicMock) -> MagicMock:
    """``mock_http_client`` plus a pinned ``retrieve(nanoid=...)`` response.

    The list-fallback account also gets a pinned ``id`` so tests can tell
    which resolution path produced the partial-bound id.
    """
    state = MagicMock()
    state.val.model_dump.return_value = {"access_token": "explicit-token"}

    explicit_account = MagicMock()
    explicit_account.id = "ca_explicit"
    explicit_account.state = state

    mock_http_client.connected_accounts.retrieve.return_value = explicit_account
    mock_http_client.connected_accounts.list.return_value.items[0].id = "ca_fallback"
    return mock_http_client


def test_execute_with_connected_account_id_calls_retrieve_not_list(
    mock_http_client_with_retrieve: MagicMock,
    custom_tools: CustomTools,
    github_tool: CustomTool,
) -> None:
    """An explicit ``connected_account_id`` MUST hit ``retrieve(nanoid=...)``.

    Pins that the explicit id wins over the "most recently created
    connection for (toolkit, user)" fallback heuristic — the user
    asked for a specific account, not whatever happens to sort first.
    """
    result = custom_tools.execute(
        slug=github_tool.slug,
        request={"issue_number": 7},
        user_id="trusted-user",
        connected_account_id="ca_explicit",
    )

    mock_http_client_with_retrieve.connected_accounts.retrieve.assert_called_once_with(
        nanoid="ca_explicit",
    )
    mock_http_client_with_retrieve.connected_accounts.list.assert_not_called()
    assert result == {"issue_number": 7, "token": "explicit-token"}


def test_execute_request_partial_binds_resolved_account_id(
    mock_http_client_with_retrieve: MagicMock,
) -> None:
    """``execute_request`` MUST pre-bind the resolved account id.

    This is the user-facing fix. Before PLEN-2345 ``execute_request``
    was a bare reference to ``client.tools.proxy``; the proxy endpoint
    now requires auth context and 400'd every custom-tool proxy call.
    """
    captured: dict = {}

    def proxy_tool(request: _IssueInput, execute_request, auth_credentials):
        """Make a proxy call from inside a custom tool."""
        execute_request(endpoint="/api/x", method="GET")
        captured["credentials"] = auth_credentials
        return {"ok": True}

    tool = CustomTool(
        f=proxy_tool, client=mock_http_client_with_retrieve, toolkit="github"
    )
    tools = CustomTools(client=mock_http_client_with_retrieve)
    tools.custom_tools_registry[tool.slug] = tool

    tools.execute(
        slug=tool.slug,
        request={"issue_number": 1},
        user_id="trusted-user",
        connected_account_id="ca_explicit",
    )

    mock_http_client_with_retrieve.tools.proxy.assert_called_once_with(
        endpoint="/api/x",
        method="GET",
        connected_account_id="ca_explicit",
    )
    assert captured["credentials"] == {"access_token": "explicit-token"}


def test_execute_request_partial_binds_listed_account_on_fallback(
    mock_http_client_with_retrieve: MagicMock,
) -> None:
    """On the list-fallback path, ``execute_request`` MUST still bind an id.

    The auth-context fix has to apply when callers do not pass
    ``connected_account_id`` — otherwise legacy code that relied on the
    "default account" behaviour stays broken on the proxy path.
    """

    def proxy_tool(request: _IssueInput, execute_request, auth_credentials):
        """Proxy from inside a custom tool with no explicit account id."""
        execute_request(endpoint="/api/y", method="GET")
        return {"ok": True}

    tool = CustomTool(
        f=proxy_tool, client=mock_http_client_with_retrieve, toolkit="github"
    )
    tools = CustomTools(client=mock_http_client_with_retrieve)
    tools.custom_tools_registry[tool.slug] = tool

    tools.execute(
        slug=tool.slug,
        request={"issue_number": 1},
        user_id="trusted-user",
    )

    mock_http_client_with_retrieve.connected_accounts.retrieve.assert_not_called()
    mock_http_client_with_retrieve.tools.proxy.assert_called_once_with(
        endpoint="/api/y",
        method="GET",
        connected_account_id="ca_fallback",
    )


def test_explicit_connected_account_id_wins_over_smuggled_one(
    mock_http_client_with_retrieve: MagicMock,
    custom_tools: CustomTools,
    github_tool: CustomTool,
) -> None:
    """The trusted ``connected_account_id`` parameter MUST beat a smuggled one.

    The allowlist drops ``connected_account_id`` from the LLM-supplied
    ``request`` (existing SEC-365 contract); the explicit parameter on
    ``CustomTools.execute`` is the only way to influence which account
    is used. This pins both halves.
    """
    custom_tools.execute(
        slug=github_tool.slug,
        request={"issue_number": 1, "connected_account_id": "ca_evil"},
        user_id="trusted-user",
        connected_account_id="ca_explicit",
    )

    mock_http_client_with_retrieve.connected_accounts.retrieve.assert_called_once_with(
        nanoid="ca_explicit",
    )


def test_tools_execute_e2e_forwards_connected_account_id(
    mock_http_client_with_retrieve: MagicMock,
    custom_tools: CustomTools,
    github_tool: CustomTool,
) -> None:
    """``Tools.execute(connected_account_id=...)`` MUST reach the custom-tool branch.

    End-to-end pin on the public SDK entry point: before PLEN-2345 the
    custom-tool branch did not accept ``connected_account_id``, so the
    parameter was silently dropped at the routing fork in ``Tools.execute``.
    """
    from composio.core.models.tools import Tools

    provider = MagicMock()
    provider.name = "test"

    tools = Tools(client=mock_http_client_with_retrieve, provider=provider)
    tools._custom_tools = custom_tools

    response = tools.execute(
        slug=github_tool.slug,
        arguments={"issue_number": 1},
        user_id="trusted-user",
        connected_account_id="ca_explicit",
    )

    assert response["successful"] is True
    assert response["data"]["token"] == "explicit-token"
    mock_http_client_with_retrieve.connected_accounts.retrieve.assert_called_once_with(
        nanoid="ca_explicit",
    )


def test_call_pops_connected_account_id_before_request_validation(
    mock_http_client_with_retrieve: MagicMock,
) -> None:
    """``CustomTool.__call__`` MUST extract ``connected_account_id`` from kwargs.

    Mirrors how ``__call__`` already refuses ``user_id``: auth-path keys
    are structurally separate from request kwargs and never reach the
    user's tool function as a request field.
    """
    captured: dict = {}

    def echo_tool(request: _IssueInput, execute_request, auth_credentials):
        """Echo the validated request."""
        captured["fields"] = request.model_dump()
        return {"ok": True}

    tool = CustomTool(
        f=echo_tool, client=mock_http_client_with_retrieve, toolkit="github"
    )
    tool(issue_number=1, connected_account_id="ca_explicit")

    assert captured["fields"] == {"issue_number": 1}
    mock_http_client_with_retrieve.connected_accounts.retrieve.assert_called_once_with(
        nanoid="ca_explicit",
    )
