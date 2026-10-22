"""Test SDK functionality."""

import os
import typing as t
from unittest.mock import patch

import composio_client
import httpx
import pytest
from composio_client import AutoAuth, ProjectAuth, Scope, UserAuth
from composio_client import ComposioError as ClientComposioError

from composio import Composio, exceptions
from composio.client import HttpClient
from composio.core.provider._openai import OpenAIProvider


class TestComposioSDK:
    """Test cases for Composio SDK."""

    def test_sdk_requires_api_key(self):
        """Test that SDK requires an API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(exceptions.ApiKeyNotProvidedError):
                Composio()

    def test_sdk_explicit_none_api_key_does_not_fall_back_to_env(self):
        """Only an omitted ``api_key`` falls back to COMPOSIO_API_KEY."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with pytest.raises(exceptions.ApiKeyNotProvidedError):
                Composio(api_key=None)

    def test_sdk_forwards_user_and_org_api_keys_to_client(self):
        """User and org keys reach the API client, which selects them per operation."""
        sdk = Composio(
            api_key="ak_test", user_api_key="uak_test", org_api_key="oak_test"
        )
        assert sdk.client.auth_mode == "auto"
        assert sdk.client.sdk_auth == AutoAuth(
            project="ak_test", user="uak_test", organization="oak_test"
        )

    def test_sdk_reads_user_and_org_api_keys_from_env(self):
        """The SDK resolves COMPOSIO_USER_API_KEY / COMPOSIO_ORG_API_KEY; the
        client reads no environment."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "ak_env",
                "COMPOSIO_USER_API_KEY": "uak_env",
                "COMPOSIO_ORG_API_KEY": "oak_env",
            },
        ):
            sdk = Composio()
        assert sdk.client.sdk_auth == AutoAuth(
            project="ak_env", user="uak_env", organization="oak_env"
        )

    def test_sdk_config_types(self):
        """Test SDK configuration types."""
        from composio.sdk import SDKConfig

        # Test that SDKConfig is a TypedDict
        assert hasattr(SDKConfig, "__annotations__")

        # Test that all expected fields are present
        expected_fields = {
            "environment",
            "api_key",
            "disable_api_key",
            "user_api_key",
            "org_api_key",
            "org_id",
            "project_id",
            "base_url",
            "timeout",
            "max_retries",
            "allow_tracking",
            "file_download_dir",
            "toolkit_versions",
            "dangerously_allow_auto_upload_download_files",
            "sensitive_file_upload_protection",
            "file_upload_path_deny_segments",
            "file_upload_dirs",
            "http_client",
            "logger",
            "logging_level",
        }
        assert set(SDKConfig.__annotations__.keys()) == expected_fields

    def test_sdk_mounts_webhooks_and_logs(self):
        from composio.core.models import Logs, Webhooks

        composio = Composio(api_key="test-key")

        assert isinstance(composio.webhooks, Webhooks)
        assert isinstance(composio.logs, Logs)
        assert composio.webhooks._client is composio._client
        assert composio.logs._client is composio._client

    def test_sdk_mounts_keyring_and_custom_toolkits(self):
        from composio.core.models import ExperimentalCustomToolkits, Keyring

        composio = Composio(api_key="test-key")

        assert isinstance(composio.keyring, Keyring)
        assert composio.keyring._client is composio._client
        assert isinstance(
            composio.experimental.custom_toolkits, ExperimentalCustomToolkits
        )
        assert composio.experimental.custom_toolkits._client is composio._client

    def test_sdk_has_required_attributes(self):
        """Test that SDK has required attributes after initialization."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with patch("composio.core.models.Tools"):
                with patch("composio.core.models.Toolkits"):
                    with patch("composio.core.models.Triggers"):
                        with patch("composio.core.models.AuthConfigs"):
                            with patch("composio.core.models.ConnectedAccounts"):
                                sdk = Composio()

                                # Check that all required attributes are present
                                assert hasattr(sdk, "tools")
                                assert hasattr(sdk, "toolkits")
                                assert hasattr(sdk, "triggers")
                                assert hasattr(sdk, "auth_configs")
                                assert hasattr(sdk, "connected_accounts")
                                assert hasattr(sdk, "provider")
                                assert hasattr(sdk, "client")

    def test_default_provider_is_isolated_per_instance(self):
        """Regression test for #4369.

        The default provider used to be a module-level singleton. Because every
        ``Tools`` instance rebinds ``provider.execute_tool`` to itself, the last
        constructed ``Composio()`` silently took over tool execution for every
        other instance, routing calls through the wrong API key.
        """
        sdk_a = Composio(api_key="key-a")
        sdk_b = Composio(api_key="key-b")

        assert isinstance(sdk_a.provider, OpenAIProvider)
        assert isinstance(sdk_b.provider, OpenAIProvider)
        assert sdk_a.provider is not sdk_b.provider

        # execute_tool is a functools.partial over Tools.execute; each provider
        # must stay bound to the Tools of the instance that created it.
        assert sdk_a.provider.execute_tool.func.__self__ is sdk_a.tools
        assert sdk_b.provider.execute_tool.func.__self__ is sdk_b.tools

    def test_explicit_provider_is_used_unchanged(self):
        """An explicitly passed provider instance is used as-is."""
        provider = OpenAIProvider()
        sdk = Composio(provider=provider, api_key="key-a")
        assert sdk.provider is provider

    def test_sdk_env_var_integration(self):
        """Test that SDK properly integrates with environment variables for toolkit versions."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "test-key",
                "COMPOSIO_TOOLKIT_VERSION_GITHUB": "v1.0.0",
                "COMPOSIO_TOOLKIT_VERSION_SLACK": "v2.0.0",
            },
        ):
            with patch("composio.sdk.Tools") as mock_tools_class:
                with patch("composio.sdk.Toolkits"):
                    with patch("composio.sdk.Triggers"):
                        with patch("composio.sdk.AuthConfigs"):
                            with patch("composio.sdk.ConnectedAccounts"):
                                # Create SDK instance without explicit toolkit versions
                                Composio()

                                # Verify that Tools was initialized with processed versions
                                mock_tools_class.assert_called_once()
                                call_args = mock_tools_class.call_args

                                # The toolkit_versions should be a dict from env vars
                                toolkit_versions = call_args.kwargs.get(
                                    "toolkit_versions"
                                )
                                expected = {"github": "v1.0.0", "slack": "v2.0.0"}
                                assert toolkit_versions == expected

    def test_sdk_user_override_env_vars(self):
        """Test that user-provided toolkit versions override environment variables."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "test-key",
                "COMPOSIO_TOOLKIT_VERSION_GITHUB": "env_version",
                "COMPOSIO_TOOLKIT_VERSION_SLACK": "env_slack",
            },
        ):
            with patch("composio.sdk.Tools") as mock_tools_class:
                with patch("composio.sdk.Toolkits"):
                    with patch("composio.sdk.Triggers"):
                        with patch("composio.sdk.AuthConfigs"):
                            with patch("composio.sdk.ConnectedAccounts"):
                                # User provides override
                                user_versions = {
                                    "github": "user_override",
                                    "jira": "user_jira",
                                }
                                Composio(toolkit_versions=user_versions)

                                # Verify Tools was initialized with merged versions
                                mock_tools_class.assert_called_once()
                                call_args = mock_tools_class.call_args

                                toolkit_versions = call_args.kwargs.get(
                                    "toolkit_versions"
                                )
                                expected = {
                                    "github": "user_override",  # User override
                                    "slack": "env_slack",  # From env
                                    "jira": "user_jira",  # User provided
                                }
                                assert toolkit_versions == expected


MCP_URL = "https://backend.composio.dev/api/v3/tool_router/session/session_123/mcp"


def _session_transport() -> t.Tuple[httpx.Client, t.List[httpx.Request]]:
    requests: t.List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "session_id": "session_123",
                "mcp": {"type": "http", "url": MCP_URL},
                "config": {
                    "user_id": "user_123",
                    "execute": {},
                    "search": {},
                    "preload": {"tools": []},
                },
                "config_version": 3,
                "warnings": [],
            },
        )

    return httpx.Client(transport=httpx.MockTransport(handler)), requests


class TestUserOnlyInitialization:
    """``disable_api_key`` turns the project key off and keeps one credential."""

    def test_user_key_session_carries_only_the_user_key(self):
        http_client, requests = _session_transport()
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sdk = Composio(
                disable_api_key=True,
                user_api_key="uak_user_key",
                base_url="https://backend.composio.dev",
                http_client=http_client,
            )
            assert sdk.client.auth_mode == "user"
            session = sdk.sessions.create(user_id="user_123", mcp=True)

        assert "x-api-key" not in requests[0].headers
        assert requests[0].headers["x-user-api-key"] == "uak_user_key"
        assert "x-org-id" not in requests[0].headers
        assert "x-project-id" not in requests[0].headers
        assert session.mcp.headers == {"x-user-api-key": "uak_user_key"}

    def test_user_key_session_carries_the_org_and_project_scope(self):
        http_client, requests = _session_transport()
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sdk = Composio(
                disable_api_key=True,
                user_api_key="uak_user_key",
                org_id="org_nano_abc",
                project_id="proj_nano_xyz",
                base_url="https://backend.composio.dev",
                http_client=http_client,
            )
            session = sdk.sessions.create(user_id="user_123", mcp=True)

        assert "x-api-key" not in requests[0].headers
        assert requests[0].headers["x-user-api-key"] == "uak_user_key"
        assert requests[0].headers["x-org-id"] == "org_nano_abc"
        assert requests[0].headers["x-project-id"] == "proj_nano_xyz"
        assert session.mcp.headers == {
            "x-user-api-key": "uak_user_key",
            "x-org-id": "org_nano_abc",
            "x-project-id": "proj_nano_xyz",
        }

    def test_user_key_is_read_from_the_environment_when_disabled(self):
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "ak_foreign_env_key",
                "COMPOSIO_USER_API_KEY": "uak_env",
            },
        ):
            sdk = Composio(disable_api_key=True)

        assert sdk.client.sdk_auth == UserAuth("uak_env")

    def test_disable_without_a_user_key_raises(self):
        with patch.dict(
            os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}, clear=True
        ):
            with pytest.raises(exceptions.UserApiKeyNotProvidedError):
                Composio(disable_api_key=True)

    def test_user_auth_beside_a_raw_project_key_header_raises(self):
        """The client owns the credential headers while ``auth`` holds a key."""
        http_client, requests = _session_transport()
        with pytest.raises(ClientComposioError) as excinfo:
            HttpClient(
                provider="test",
                auth=UserAuth("uak_user_key"),
                default_headers={"X-Api-Key": "ak_raw_header"},
                http_client=http_client,
            )

        assert "`x-api-key`" in str(excinfo.value)
        assert "ak_raw_header" not in str(excinfo.value)
        assert requests == []

    def test_client_clones_cannot_reintroduce_a_raw_project_key_header(self):
        http_client, requests = _session_transport()
        sdk = Composio(
            disable_api_key=True,
            user_api_key="uak_user_key",
            base_url="https://backend.composio.dev",
            http_client=http_client,
        )

        with pytest.raises(ClientComposioError):
            sdk.client.with_options(default_headers={"x-api-key": "ak_raw_header"})
        sdk.sessions.create(user_id="user_123")

        assert len(requests) == 1
        assert "x-api-key" not in requests[0].headers
        assert requests[0].headers["x-user-api-key"] == "uak_user_key"

    def test_disable_beside_an_explicit_project_key_raises(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(disable_api_key=True, api_key="ak_explicit", user_api_key="uak")

    def test_half_scope_raises(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="org_nano_abc")
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", project_id="proj_nano_xyz")

    def test_empty_scope_id_counts_as_unset(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="org_nano_abc", project_id="")
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="", project_id="proj_nano_xyz")

        sdk = Composio(api_key="ak_test", org_id="", project_id="")
        assert sdk.client.scope is None
        assert "x-org-id" not in sdk.client.default_headers
        assert "x-project-id" not in sdk.client.default_headers

    def test_omitted_api_key_keeps_the_environment_fallback(self):
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_env"}):
            sdk = Composio(user_api_key="uak")
        assert sdk.client.sdk_auth == AutoAuth(project="ak_env", user="uak")

    def test_client_clones_stay_user_only_when_the_environment_changes(self):
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sdk = Composio(disable_api_key=True, user_api_key="uak_user_key")
            clone = sdk.client.with_options(max_retries=0)

        assert sdk.client.sdk_auth == UserAuth("uak_user_key")
        assert clone.sdk_auth == UserAuth("uak_user_key")
        assert clone.auth_mode == "user"
        assert clone.max_retries == 0

    def test_generated_client_reads_no_environment(self):
        """The SDK, not the generated client, resolves keys from the environment."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_env"}):
            client = composio_client.Composio(auth=UserAuth("uak"))

        assert client.auth_mode == "user"


def _recording_transport() -> t.Tuple[httpx.Client, t.List[httpx.Request]]:
    requests: t.List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={})

    return httpx.Client(transport=httpx.MockTransport(handler)), requests


#: An operation that accepts the project key, one that accepts only a user key
#: and one that accepts only an organization key.
PROJECT_OP = "/api/v3.1/tools"
USER_OP = "/api/v3.1/org/list"
ORG_OP = "/api/v3.1/org/owner/project/list"

CREDENTIAL_HEADERS = ("x-api-key", "x-user-api-key", "x-org-api-key")


def _credentials_sent(sdk: Composio, path: str, requests: t.List[httpx.Request]):
    sdk.client.get(path, cast_to=dict)
    return {
        name: requests[-1].headers[name]
        for name in CREDENTIAL_HEADERS
        if name in requests[-1].headers
    }


class TestAuthAndScopeMapping:
    """What the SDK resolves becomes the client's ``auth`` and ``scope``."""

    @pytest.fixture(autouse=True)
    def _isolated_environment(self):
        with patch.dict(os.environ, {}, clear=True):
            yield

    @pytest.mark.parametrize(
        ("config", "expected"),
        [
            ({"api_key": "ak"}, ProjectAuth("ak")),
            (
                {"api_key": "ak", "user_api_key": "uak"},
                AutoAuth(project="ak", user="uak"),
            ),
            (
                {"api_key": "ak", "org_api_key": "oak"},
                AutoAuth(project="ak", organization="oak"),
            ),
            (
                {"api_key": "ak", "user_api_key": "uak", "org_api_key": "oak"},
                AutoAuth(project="ak", user="uak", organization="oak"),
            ),
            ({"disable_api_key": True, "user_api_key": "uak"}, UserAuth("uak")),
            (
                {"disable_api_key": True, "user_api_key": "uak", "org_api_key": "oak"},
                UserAuth("uak"),
            ),
            # Empty keys count as unset, as the environment fallback always has.
            (
                {"api_key": "ak", "user_api_key": "", "org_api_key": ""},
                ProjectAuth("ak"),
            ),
        ],
    )
    def test_keys_map_to_auth(self, config, expected):
        sdk = Composio(**config)

        assert sdk.client.sdk_auth == expected
        assert sdk.client.auth_mode == expected.mode

    def test_environment_keys_map_to_auth(self):
        with patch.dict(
            os.environ,
            {"COMPOSIO_API_KEY": "ak_env", "COMPOSIO_ORG_API_KEY": "oak_env"},
        ):
            sdk = Composio()

        assert sdk.client.sdk_auth == AutoAuth(project="ak_env", organization="oak_env")

    def test_blank_environment_keys_count_as_unset(self):
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "ak_env",
                "COMPOSIO_USER_API_KEY": "  ",
                "COMPOSIO_ORG_API_KEY": "",
            },
        ):
            sdk = Composio()

        assert sdk.client.sdk_auth == ProjectAuth("ak_env")

    def test_explicit_keys_win_over_the_environment(self):
        with patch.dict(
            os.environ,
            {"COMPOSIO_USER_API_KEY": "uak_env", "COMPOSIO_ORG_API_KEY": "oak_env"},
        ):
            sdk = Composio(api_key="ak", user_api_key="uak", org_api_key="oak")

        assert sdk.client.sdk_auth == AutoAuth(
            project="ak", user="uak", organization="oak"
        )

    def test_project_key_alone_is_sent_on_every_operation(self):
        http_client, requests = _recording_transport()
        sdk = Composio(api_key="ak", http_client=http_client)

        for path in (PROJECT_OP, USER_OP, ORG_OP):
            assert _credentials_sent(sdk, path, requests) == {"x-api-key": "ak"}

    def test_auto_auth_sends_exactly_one_credential_per_operation(self):
        http_client, requests = _recording_transport()
        sdk = Composio(
            api_key="ak", user_api_key="uak", org_api_key="oak", http_client=http_client
        )

        assert _credentials_sent(sdk, PROJECT_OP, requests) == {"x-api-key": "ak"}
        assert _credentials_sent(sdk, USER_OP, requests) == {"x-user-api-key": "uak"}
        assert _credentials_sent(sdk, ORG_OP, requests) == {"x-org-api-key": "oak"}

    def test_user_only_sends_the_user_key_on_every_operation(self):
        http_client, requests = _recording_transport()
        sdk = Composio(
            disable_api_key=True,
            user_api_key="uak",
            org_api_key="oak",
            http_client=http_client,
        )

        for path in (PROJECT_OP, USER_OP, ORG_OP):
            assert _credentials_sent(sdk, path, requests) == {"x-user-api-key": "uak"}

    def test_scope_ids_become_the_client_scope(self):
        http_client, requests = _recording_transport()
        sdk = Composio(
            api_key="ak",
            org_id="org_nano_abc",
            project_id="proj_nano_xyz",
            http_client=http_client,
        )

        assert sdk.client.scope == Scope(
            organization_id="org_nano_abc", project_id="proj_nano_xyz"
        )
        assert sdk.client.default_headers == {}
        sdk.client.get(PROJECT_OP, cast_to=dict)
        assert requests[0].headers["x-org-id"] == "org_nano_abc"
        assert requests[0].headers["x-project-id"] == "proj_nano_xyz"

    def test_scope_survives_a_clone(self):
        sdk = Composio(api_key="ak", org_id="org_nano_abc", project_id="proj_nano_xyz")

        clone = sdk.client.with_options(max_retries=0)

        assert clone.scope == sdk.client.scope
        assert clone.sdk_auth == ProjectAuth("ak")

    def test_no_scope_leaves_the_client_unscoped(self):
        http_client, requests = _recording_transport()
        sdk = Composio(api_key="ak", http_client=http_client)

        assert sdk.client.scope is None
        sdk.client.get(PROJECT_OP, cast_to=dict)
        assert "x-org-id" not in requests[0].headers
        assert "x-project-id" not in requests[0].headers

    def test_custom_headers_from_the_environment_are_still_sent(self):
        http_client, requests = _recording_transport()
        with patch.dict(
            os.environ, {"COMPOSIO_CUSTOM_HEADERS": "x-trace: abc\nx-team:  core "}
        ):
            sdk = Composio(api_key="ak", http_client=http_client)

        sdk.client.get(PROJECT_OP, cast_to=dict)
        assert requests[0].headers["x-trace"] == "abc"
        assert requests[0].headers["x-team"] == "core"

    def test_every_api_request_carries_a_request_id(self):
        http_client, requests = _recording_transport()
        sdk = Composio(api_key="ak", http_client=http_client)

        sdk.client.get(PROJECT_OP, cast_to=dict)
        sdk.client.get(PROJECT_OP, cast_to=dict)
        sdk.client.get("https://storage.invalid/file", cast_to=dict)

        first, second, foreign = (r.headers.get("x-request-id") for r in requests)
        assert first and second and first != second
        assert foreign is None
