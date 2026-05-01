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
