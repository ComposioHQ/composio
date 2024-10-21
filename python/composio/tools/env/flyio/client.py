"""FlyIO Client."""

import os
import time
import typing as t
import uuid

import requests
import typing_extensions as te

from composio.tools.env.constants import DEFAULT_IMAGE
from composio.utils.logging import WithLogger


try:
    import gql
    import gql.transport
    from gql.transport.requests import RequestsHTTPTransport

    FLYIO_DEPENDENCIES_INSTALLED = True
except ImportError:
    RequestsHTTPTransport = t.Any
    FLYIO_DEPENDENCIES_INSTALLED = False


FLY_API = "https://api.machines.dev"
FLY_GRAPHQL_API = "https://api.fly.io/graphql"
API_VERSION = "/v1"
BASE_URL = FLY_API + API_VERSION


ALLOCATE_IP_QUERY = """mutation {
  allocateIpAddress(input: { appId: "{app_name}", type: shared_v4 }) {
    ipAddress {
      address
      type
    }
    clientMutationId
  }
}
"""

GET_IP_REQUEST = """query {
  app(name:"{app_name}"){
    sharedIpAddress
  }
}
"""


RELEASE_IP_REQUEST = """mutation {
  releaseIpAddress(input: { appId: "{app_name}", ip: "{ip}" }) {
    app {
      id
    }
    clientMutationId
  }
}
"""

ENV_FLY_API_TOKEN = "FLY_API_TOKEN"


TOOLING_ERVICE = {
    "ports": [
        {"port": 8000, "handlers": ["tls", "http"]},
    ],
    "protocol": "tcp",
    "internal_port": 8000,
}


class ExternalPortConfig(te.TypedDict):
    """External port config."""

    port: int
    """External port to map (Port 8000 is reserved for the tooling server)."""

    handlers: t.List[str]
    """List of protocol handlers (`http` will be used if not provided)."""


class PortRequest(te.TypedDict):
    """
    Port request

    Read more at: https://fly.io/docs/machines/api/machines-resource/#create-a-machine-with-services
    """

    ports: t.List[ExternalPortConfig]
    """List of public port configurations (Port 8000 is reserved for the tooling server)."""

    internal_port: int
    """Internal port number (Port 8000 is reserved for the tooling server)."""

    protocol: t.Literal["tcp", "udp"]
    """List of protocol handlers."""


class FlyIO(WithLogger):
    """FlyIO client."""

    machine: str

    def __init__(
        self,
        access_token: str,
        image: t.Optional[str] = None,
        flyio_token: t.Optional[str] = None,
        environment: t.Optional[t.Dict] = None,
        ports: t.Optional[t.List[PortRequest]] = None,
    ) -> None:
        """Initialize FlyIO client."""
        super().__init__()
        flyio_token = flyio_token or os.environ.get(ENV_FLY_API_TOKEN)
        if flyio_token is None:
            raise ValueError(
                "FlyIO API Key is required for using FlyIO workspace, "
                f"You can export it as `{ENV_FLY_API_TOKEN}`"
            )

        self.ports = ports or []
        self.environment = environment or {}
        self.flyio_token = flyio_token
        self.access_token = access_token
        self.image = image or DEFAULT_IMAGE
        self.app_name = f"composio-{uuid.uuid4().hex.replace('-', '')}"
        self.url = f"https://{self.app_name}.fly.dev:8000/api"
        self.gql = gql.Client(
            transport=RequestsHTTPTransport(
                url=FLY_GRAPHQL_API,
                headers={
                    "Authorization": f"Bearer {self.flyio_token}",
                },
            )
        )

    def _request(
        self,
        method: str,
        endpoint: str,
        json: t.Optional[dict] = None,
        timeout: t.Optional[float] = 15.0,
    ) -> requests.Response:
        """Make request to machines API."""
        return requests.request(
            method=method,
            url=f"{BASE_URL}{endpoint}",
            json=json,
            headers={
                "Authorization": f"Bearer {self.flyio_token}",
            },
            timeout=timeout,
        )

    def _create_app(self) -> None:
        self._request(
            method="post",
            endpoint="/apps",
            json={
                "app_name": self.app_name,
                "org_slug": "personal",
            },
        ).json()

    def _delete_app(self) -> None:
        self._request(
            method="delete",
            endpoint=f"/apps/{self.app_name}",
        ).content.decode()

    def _allocate_ip(self) -> None:
        self.gql.execute(
            document=gql.gql(
                request_string=ALLOCATE_IP_QUERY.replace(
                    "{app_name}",
                    self.app_name,
                )
            ),
        )

    def _get_ip(self) -> str:
        return (
            self.gql.execute(
                document=gql.gql(
                    request_string=GET_IP_REQUEST.replace(
                        "{app_name}",
                        self.app_name,
                    )
                ),
            )
            .get("app")
            .get("sharedIpAddress")  # type: ignore
        )

    def _release_ip(self) -> None:
        self.gql.execute(
            document=gql.gql(
                request_string=RELEASE_IP_REQUEST.replace(
                    "{app_name}",
                    self.app_name,
                ).replace(
                    "{ip}",
                    self._get_ip(),
                )
            ),
        )

    def _wait_for_machine(self) -> None:
        """Wait for machine to get started."""
        deadline = time.time() + float(os.environ.get("WORKSPACE_WAIT_TIMEOUT", 60.0))
        while time.time() < deadline:
            try:
                requests.get(
                    self.url,
                    headers={"x-api-key": self.access_token},
                    timeout=30.0,
                ).content.decode()
                return
            except Exception:  # pylint: disable=broad-except
                time.sleep(1)

    def _create_machine(self) -> None:
        self.machine = (
            self._request(
                method="post",
                endpoint=f"/apps/{self.app_name}/machines",
                json={
                    "config": {
                        "image": self.image,
                        "env": self.environment,
                        "services": [TOOLING_ERVICE, *self.ports],
                        "guest": {
                            "cpu_kind": "shared",
                            "cpus": 1,
                            "memory_mb": 512,
                        },
                    }
                },
            )
            .json()
            .get("id")
        )

    def _stop_machine(self) -> None:
        self._request(
            method="post",
            endpoint=f"/apps/{self.app_name}/machines/{self.machine}/stop",
        ).json()

    def _delete_machine(self) -> None:
        self._request(
            method="delete",
            endpoint=f"/apps/{self.app_name}/machines/{self.machine}?force=true",
        ).json()

    def setup(self) -> None:
        """Setup FlyIO machine."""
        self.logger.debug(f"Creating app with name `{self.app_name}`")
        self._create_app()
        self.logger.debug("Allocating IP to the app")
        self._allocate_ip()
        self.logger.debug(f"Allocated IP `{self._get_ip()}` to app `{self.app_name}`")
        self._create_machine()
        self.logger.debug("Waiting for machine to start")
        self._wait_for_machine()
        self.logger.debug(f"Created machine {self.machine}")

    def teardown(self) -> None:
        """Teardown FlyIO machine."""
        self.logger.debug(f"Stopping machine `{self.machine}`")
        self._stop_machine()
        self.logger.debug(f"Deleting machine `{self.machine}`")
        self._delete_machine()
        self.logger.debug(f"Releasing IP for `{self.app_name}`")
        self._release_ip()
        self.logger.debug(f"Deleting app `{self.app_name}`")
        self._delete_app()
