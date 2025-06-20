from __future__ import annotations

import functools
import json
import time
import traceback
import typing as t
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest import mock

import typing_extensions as te
from pysher import Pusher
from pysher.channel import Channel as PusherChannel
from pysher.connection import Connection as PusherConnection

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import trigger_instance_upsert_response
from composio.core.models.base import Resource
from composio.core.models.internal import Internal
from composio.exceptions import ComposioSDKTimeoutError
from composio.utils.logging import WithLogger

PUSHER_AUTH_URL = "{base_url}/api/v3/internal/sdk/realtime/auth?source=python"

"""
export type _TriggerData = {
  appName: string;
  clientId: number;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    nanoId: string;
    triggerName: string;
    triggerData: string;
    triggerConfig: Record<string, unknown>;
    connection: {
      id: string;
      connectedAccountNanoId: string;
      integrationId: string;
      authConfigNanoId: string;
      clientUniqueUserId: string;
      status: string;
    };
  };
};
"""


class _ConnectionData(te.TypedDict):
    id: str
    status: t.Literal["ACTIVE", "INACTIVE"]
    integrationId: str
    authConfigNanoId: str
    clientUniqueUserId: str
    connectedAccountNanoId: str


class _TriggerMetadata(te.TypedDict):
    id: str
    nanoId: str
    triggerName: str
    triggerData: str
    triggerConfig: t.Dict
    connection: _ConnectionData


class _TriggerData(te.TypedDict):
    clientId: str
    appName: str
    payload: t.Dict
    metadata: _TriggerMetadata
    originalPayload: t.Dict


class TriggerConnectedAccountSchema(t.TypedDict):
    id: str
    uuid: str
    user_id: str
    auth_config_id: str
    auth_config_uuid: str
    status: t.Literal["ACTIVE", "INACTIVE"]


class TriggerMetadataSchema(t.TypedDict):
    id: str
    toolkit_slug: str
    trigger_slug: str
    trigger_data: t.Optional[str]
    trigger_config: t.Dict[str, t.Any]
    connected_account: TriggerConnectedAccountSchema


class TriggerEvent(t.TypedDict):
    id: str  # The ID of the trigger
    uuid: str  # UUID of the trigger
    user_id: str  # The ID of the user that triggered the event

    trigger_slug: str  # The slug of the trigger that triggered the event
    toolkit_slug: str  # The slug of the toolkit that triggered the event

    payload: t.Optional[t.Dict[str, t.Any]]  # The payload of the trigger
    metadata: TriggerMetadataSchema
    original_payload: t.Optional[
        t.Dict[str, t.Any]
    ]  # The original payload of the trigger


_ = {
    "appName": "github",
    "payload": {
        "author": "angrybayblade",
        "id": "a2334682759c4324e911d8f52f8fb6bdf1338d94",
        "message": "temp",
        "timestamp": "2025-06-19T11:28:01+05:30",
        "url": "https://github.com/angrybayblade/ph7/commit/a2334682759c4324e911d8f52f8fb6bdf1338d94",
    },
    "originalPayload": {
        "ref": "refs/heads/temp",
        "before": "e5eb72bc9f973b6cc82e0de9708660c5341befe5",
        "after": "a2334682759c4324e911d8f52f8fb6bdf1338d94",
        "repository": {
            "id": 752122629,
            "node_id": "R_kgDOLNR7BQ",
            "name": "ph7",
            "full_name": "angrybayblade/ph7",
            "private": False,
            "owner": {
                "name": "angrybayblade",
                "email": "35092918+angrybayblade@users.noreply.github.com",
                "login": "angrybayblade",
                "id": 35092918,
                "node_id": "MDQ6VXNlcjM1MDkyOTE4",
                "avatar_url": "https://avatars.githubusercontent.com/u/35092918?v=4",
                "gravatar_id": "",
                "url": "https://api.github.com/users/angrybayblade",
                "html_url": "https://github.com/angrybayblade",
                "followers_url": "https://api.github.com/users/angrybayblade/followers",
                "following_url": "https://api.github.com/users/angrybayblade/following{/other_user}",
                "gists_url": "https://api.github.com/users/angrybayblade/gists{/gist_id}",
                "starred_url": "https://api.github.com/users/angrybayblade/starred{/owner}{/repo}",
                "subscriptions_url": "https://api.github.com/users/angrybayblade/subscriptions",
                "organizations_url": "https://api.github.com/users/angrybayblade/orgs",
                "repos_url": "https://api.github.com/users/angrybayblade/repos",
                "events_url": "https://api.github.com/users/angrybayblade/events{/privacy}",
                "received_events_url": "https://api.github.com/users/angrybayblade/received_events",
                "type": "User",
                "user_view_type": "public",
                "site_admin": False,
            },
            "html_url": "https://github.com/angrybayblade/ph7",
            "description": "💧 Python native HTML rendering",
            "fork": False,
            "url": "https://api.github.com/repos/angrybayblade/ph7",
            "forks_url": "https://api.github.com/repos/angrybayblade/ph7/forks",
            "keys_url": "https://api.github.com/repos/angrybayblade/ph7/keys{/key_id}",
            "collaborators_url": "https://api.github.com/repos/angrybayblade/ph7/collaborators{/collaborator}",
            "teams_url": "https://api.github.com/repos/angrybayblade/ph7/teams",
            "hooks_url": "https://api.github.com/repos/angrybayblade/ph7/hooks",
            "issue_events_url": "https://api.github.com/repos/angrybayblade/ph7/issues/events{/number}",
            "events_url": "https://api.github.com/repos/angrybayblade/ph7/events",
            "assignees_url": "https://api.github.com/repos/angrybayblade/ph7/assignees{/user}",
            "branches_url": "https://api.github.com/repos/angrybayblade/ph7/branches{/branch}",
            "tags_url": "https://api.github.com/repos/angrybayblade/ph7/tags",
            "blobs_url": "https://api.github.com/repos/angrybayblade/ph7/git/blobs{/sha}",
            "git_tags_url": "https://api.github.com/repos/angrybayblade/ph7/git/tags{/sha}",
            "git_refs_url": "https://api.github.com/repos/angrybayblade/ph7/git/refs{/sha}",
            "trees_url": "https://api.github.com/repos/angrybayblade/ph7/git/trees{/sha}",
            "statuses_url": "https://api.github.com/repos/angrybayblade/ph7/statuses/{sha}",
            "languages_url": "https://api.github.com/repos/angrybayblade/ph7/languages",
            "stargazers_url": "https://api.github.com/repos/angrybayblade/ph7/stargazers",
            "contributors_url": "https://api.github.com/repos/angrybayblade/ph7/contributors",
            "subscribers_url": "https://api.github.com/repos/angrybayblade/ph7/subscribers",
            "subscription_url": "https://api.github.com/repos/angrybayblade/ph7/subscription",
            "commits_url": "https://api.github.com/repos/angrybayblade/ph7/commits{/sha}",
            "git_commits_url": "https://api.github.com/repos/angrybayblade/ph7/git/commits{/sha}",
            "comments_url": "https://api.github.com/repos/angrybayblade/ph7/comments{/number}",
            "issue_comment_url": "https://api.github.com/repos/angrybayblade/ph7/issues/comments{/number}",
            "contents_url": "https://api.github.com/repos/angrybayblade/ph7/contents/{+path}",
            "compare_url": "https://api.github.com/repos/angrybayblade/ph7/compare/{base}...{head}",
            "merges_url": "https://api.github.com/repos/angrybayblade/ph7/merges",
            "archive_url": "https://api.github.com/repos/angrybayblade/ph7/{archive_format}{/ref}",
            "downloads_url": "https://api.github.com/repos/angrybayblade/ph7/downloads",
            "issues_url": "https://api.github.com/repos/angrybayblade/ph7/issues{/number}",
            "pulls_url": "https://api.github.com/repos/angrybayblade/ph7/pulls{/number}",
            "milestones_url": "https://api.github.com/repos/angrybayblade/ph7/milestones{/number}",
            "notifications_url": "https://api.github.com/repos/angrybayblade/ph7/notifications{?since,all,participating}",
            "labels_url": "https://api.github.com/repos/angrybayblade/ph7/labels{/name}",
            "releases_url": "https://api.github.com/repos/angrybayblade/ph7/releases{/id}",
            "deployments_url": "https://api.github.com/repos/angrybayblade/ph7/deployments",
            "created_at": 1706936166,
            "updated_at": "2025-03-22T17:26:27Z",
            "pushed_at": 1750312684,
            "git_url": "git://github.com/angrybayblade/ph7.git",
            "ssh_url": "git@github.com:angrybayblade/ph7.git",
            "clone_url": "https://github.com/angrybayblade/ph7.git",
            "svn_url": "https://github.com/angrybayblade/ph7",
            "homepage": "https://angrybayblade.github.io/ph7/",
            "size": 3031,
            "stargazers_count": 7,
            "watchers_count": 7,
            "language": "Python",
            "has_issues": True,
            "has_projects": True,
            "has_downloads": True,
            "has_wiki": True,
            "has_pages": True,
            "has_discussions": False,
            "forks_count": 1,
            "mirror_url": None,
            "archived": False,
            "disabled": False,
            "open_issues_count": 0,
            "license": None,
            "allow_forking": True,
            "is_template": False,
            "web_commit_signoff_required": False,
            "topics": [
                "css",
                "django",
                "flask",
                "html",
                "js",
                "template-engine",
                "web",
            ],
            "visibility": "public",
            "forks": 1,
            "open_issues": 0,
            "watchers": 7,
            "default_branch": "main",
            "stargazers": 7,
            "master_branch": "main",
        },
        "pusher": {
            "name": "angrybayblade",
            "email": "35092918+angrybayblade@users.noreply.github.com",
        },
        "sender": {
            "login": "angrybayblade",
            "id": 35092918,
            "node_id": "MDQ6VXNlcjM1MDkyOTE4",
            "avatar_url": "https://avatars.githubusercontent.com/u/35092918?v=4",
            "gravatar_id": "",
            "url": "https://api.github.com/users/angrybayblade",
            "html_url": "https://github.com/angrybayblade",
            "followers_url": "https://api.github.com/users/angrybayblade/followers",
            "following_url": "https://api.github.com/users/angrybayblade/following{/other_user}",
            "gists_url": "https://api.github.com/users/angrybayblade/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/angrybayblade/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/angrybayblade/subscriptions",
            "organizations_url": "https://api.github.com/users/angrybayblade/orgs",
            "repos_url": "https://api.github.com/users/angrybayblade/repos",
            "events_url": "https://api.github.com/users/angrybayblade/events{/privacy}",
            "received_events_url": "https://api.github.com/users/angrybayblade/received_events",
            "type": "User",
            "user_view_type": "public",
            "site_admin": False,
        },
        "created": False,
        "deleted": False,
        "forced": False,
        "base_ref": None,
        "compare": "https://github.com/angrybayblade/ph7/compare/e5eb72bc9f97...a2334682759c",
        "commits": [
            {
                "id": "a2334682759c4324e911d8f52f8fb6bdf1338d94",
                "tree_id": "ed0ae8c902cb2a0e12d3c64aea8aab66f7b06054",
                "distinct": True,
                "message": "temp",
                "timestamp": "2025-06-19T11:28:01+05:30",
                "url": "https://github.com/angrybayblade/ph7/commit/a2334682759c4324e911d8f52f8fb6bdf1338d94",
                "author": {
                    "name": "angrybayblade",
                    "email": "vptl185@gmail.com",
                    "username": "angrybayblade",
                },
                "committer": {
                    "name": "angrybayblade",
                    "email": "vptl185@gmail.com",
                    "username": "angrybayblade",
                },
                "added": [],
                "removed": [],
                "modified": ["mkdocs.yml"],
            }
        ],
        "head_commit": {
            "id": "a2334682759c4324e911d8f52f8fb6bdf1338d94",
            "tree_id": "ed0ae8c902cb2a0e12d3c64aea8aab66f7b06054",
            "distinct": True,
            "message": "temp",
            "timestamp": "2025-06-19T11:28:01+05:30",
            "url": "https://github.com/angrybayblade/ph7/commit/a2334682759c4324e911d8f52f8fb6bdf1338d94",
            "author": {
                "name": "angrybayblade",
                "email": "vptl185@gmail.com",
                "username": "angrybayblade",
            },
            "committer": {
                "name": "angrybayblade",
                "email": "vptl185@gmail.com",
                "username": "angrybayblade",
            },
            "added": [],
            "removed": [],
            "modified": ["mkdocs.yml"],
        },
    },
    "metadata": {
        "id": "2507236e-4be2-4606-b338-fb24c76ce38d",
        "nanoId": "ti_VZEWUqF5fQ6P",
        "connectionId": "75271255-fe95-4d34-bee3-459a02645e38",
        "connectionNanoId": "ca_5KdA-e2C4ZMd",
        "triggerName": "GITHUB_COMMIT_EVENT",
        "triggerData": '{"event_type": "push", "github_hook_id": "552965247"}',
        "triggerConfig": {"repo": "ph7", "owner": "angrybayblade"},
        "connection": {
            "id": "75271255-fe95-4d34-bee3-459a02645e38",
            "connectedAccountNanoId": "ca_5KdA-e2C4ZMd",
            "integrationId": "500748ea-8547-4abb-9f9e-10dbcfdb81c2",
            "authConfigNanoId": "ac_ZxnpxqOo1nAP",
            "clientUniqueUserId": "default",
            "status": "ACTIVE",
        },
    },
}


class _ChunkedTriggerEventData(te.TypedDict):
    """Cunked trigger event data model."""

    id: str
    index: int
    chunk: str
    final: bool


class TriggerEventFilters(te.TypedDict):
    """Trigger event filterset."""

    trigger_slug: te.NotRequired[str]
    trigger_id: te.NotRequired[str]
    toolkit: te.NotRequired[str]
    user_id: te.NotRequired[str]
    auth_config_id: te.NotRequired[str]
    connected_account_id: te.NotRequired[str]


TriggerCallback = t.Callable[[TriggerEvent], None]


class TriggerSubscription(Resource):
    """Trigger subscription."""

    _pusher: Pusher
    _channel: PusherChannel
    _connection: PusherConnection
    _alive: bool

    def __init__(self, client: HttpClient) -> None:
        """Initialize subscription object."""
        super().__init__(client=client)
        self.client = client
        self._alive = False
        self._chunks: t.Dict[str, t.Dict[int, str]] = {}
        self._callbacks: t.List[t.Tuple[TriggerCallback, TriggerEventFilters]] = []

    def handle(
        self, **filters: te.Unpack[TriggerEventFilters]
    ) -> t.Callable[[TriggerCallback], TriggerCallback]:
        """Register a trigger callaback."""

        def _wrap(f: TriggerCallback) -> TriggerCallback:
            self.logger.debug(f"Registering callback `{f.__name__}`")
            self._callbacks.append((f, filters))
            return f

        return _wrap

    def _parse_payload(self, event: str) -> t.Optional[TriggerEvent]:
        """Parse event payload."""
        try:
            data = t.cast(_TriggerData, json.loads(event))
        except Exception as e:
            self.logger.warning(f"Error decoding payload: {e}")
            return None

        return t.cast(
            TriggerEvent,
            {
                "id": data["metadata"]["nanoId"],
                "uuid": data["metadata"]["id"],
                "user_id": data["metadata"]["connection"]["clientUniqueUserId"],
                "toolkit_slug": data["appName"],
                "trigger_slug": data["metadata"]["triggerName"],
                "metadata": {
                    "id": data["metadata"]["nanoId"],
                    "uuid": data["metadata"]["id"],
                    "toolkit_slug": data["appName"],
                    "trigger_slug": data["metadata"]["triggerName"],
                    "trigger_data": data["metadata"]["triggerData"],
                    "trigger_config": data["metadata"]["triggerConfig"],
                    "connected_account": {
                        "id": data["metadata"]["connection"]["connectedAccountNanoId"],
                        "uuid": data["metadata"]["connection"]["id"],
                        "auth_config_id": data["metadata"]["connection"][
                            "authConfigNanoId"
                        ],
                        "auth_config_uuid": data["metadata"]["connection"][
                            "integrationId"
                        ],
                        "user_id": data["metadata"]["connection"]["clientUniqueUserId"],
                        "status": data["metadata"]["connection"]["status"],
                    },
                },
                "payload": data["payload"],
                "original_payload": data["originalPayload"],
            },
        )

    def _handle_chunked_events(self, event: str) -> None:
        """Handle chunked events."""
        data = _ChunkedTriggerEventData(**json.loads(event))  # type: ignore
        if data["id"] not in self._chunks:
            self._chunks[data["id"]] = {}

        self._chunks[data["id"]][data["index"]] = data["chunk"]
        if data["final"]:
            _chunks = self._chunks.pop(data["id"])
            self._handle_event(event="".join([_chunks[idx] for idx in sorted(_chunks)]))

    def _filters_match(
        self,
        data: TriggerEvent,
        filters: TriggerEventFilters,
        callback: str,
    ) -> bool:
        """Check if filters match the event data."""
        checks = (
            ("trigger_slug", data["trigger_slug"]),
            ("trigger_id", data["metadata"]["id"]),
            ("toolkit", data["toolkit_slug"]),
            ("user_id", data["user_id"]),
            ("auth_config_id", data["metadata"]["connected_account"]["auth_config_id"]),
            ("connected_account_id", data["metadata"]["connected_account"]["id"]),
        )
        for name, check in checks:
            value = filters.get(name)
            if value is None or str(value).lower() == check.lower():
                continue

            self.logger.debug(
                f"Skipping `{callback}` since "
                f"`{name}` filter does not match the event metadata",
            )
            return False
        return True

    def _handle_callback(
        self,
        callback: TriggerCallback,
        data: TriggerEvent,
        filters: TriggerEventFilters,
    ) -> t.Any:
        """Handle callback."""
        if not self._filters_match(data, filters, callback.__name__):
            return

        try:
            callback(data)
        except Exception:
            self.logger.error(
                f"Error executing `{callback.__name__}` for "
                f"event `{data['metadata']['trigger_slug']}` "
                f"with error:\n {traceback.format_exc()}"
            )

    def _handle_event(self, event: str) -> None:
        """Filter events and call the callback function."""
        data = self._parse_payload(event=event)
        if data is None:
            self.logger.error(f"Error parsing trigger payload: {event}")
            return

        self.logger.debug(
            f"Received trigger event with trigger ID: {data['metadata']['id']} "
            f"and trigger name: {data['metadata']['trigger_slug']}"
        )
        awaitables: t.List = []
        with ThreadPoolExecutor() as executor:
            for callback, filters in self._callbacks:
                awaitables.append(
                    executor.submit(
                        self._handle_callback,
                        callback,
                        data,
                        filters,
                    )
                )
        _ = [future.result() for future in awaitables]

    def is_alive(self) -> bool:
        """Check if subscription is live."""
        return self._alive

    def has_errored(self) -> bool:
        """Check if the connection errored and disconnected."""
        return self._connection.socket is None or self._connection.socket.has_errored

    def set_alive(self) -> None:
        """Set `_alive` to True."""
        self._alive = True

    def wait_forever(self) -> None:
        """Wait infinitely."""
        while self.is_alive() and not self.has_errored():
            time.sleep(1)

    def stop(self) -> None:
        """Stop the trigger listener."""
        self._connection.disconnect()
        self._alive = False

    def restart(self) -> None:
        """Restart the subscription connection"""
        self._connection.disconnect()
        self._connection._connect()  # pylint: disable=protected-access


class _SubcriptionBuilder(WithLogger):
    """Pusher client for Composio SDK."""

    def __init__(self, client: HttpClient) -> None:
        """Initialize pusher client."""
        super().__init__()
        self._client = client
        self.api_key = self._client.api_key
        self.base_url = self._client.base_url
        self.internal = Internal(client=self._client)
        self.subscription = TriggerSubscription(client=self._client)

    def _get_connection_handler(
        self,
        project_id: str,
        pusher: Pusher,
        subscription: TriggerSubscription,
    ) -> t.Callable[[str], None]:
        def _connection_handler(_: str) -> None:
            channel = t.cast(
                PusherChannel,
                pusher.subscribe(
                    channel_name=f"private-{project_id}_triggers",
                ),
            )
            channel.bind(
                event_name="trigger_to_client",
                callback=subscription._handle_event,
            )
            channel.bind(
                event_name="chunked-trigger_to_client",
                callback=subscription._handle_chunked_events,
            )
            subscription.set_alive()
            subscription._channel = channel  # pylint: disable=protected-access
            subscription._connection = (  # pylint: disable=protected-access
                channel.connection
            )

        return _connection_handler

    def _get_pusher_instance(self, key: str, cluster: str) -> Pusher:
        """Get a pusher instance."""
        return Pusher(
            key=key,
            cluster=cluster,
            auth_endpoint=PUSHER_AUTH_URL.format(base_url=self._client.base_url),
            auth_endpoint_headers={
                "x-api-key": self._client.api_key,
                "x-request-id": str(uuid.uuid4()),
            },
            auto_sub=True,
        )

    def connect(self, timeout: float = 15.0) -> TriggerSubscription:
        """Connect to Pusher channel for given client ID."""
        self.logger.debug("Creating trigger subscription")
        project_info = self.internal.get_sdk_realtime_credentials()
        pusher = self._get_pusher_instance(
            key=project_info.pusher_key,
            cluster=project_info.pusher_cluster,
        )

        # Patch pusher logger
        pusher.connection.logger = mock.MagicMock()  # type: ignore
        pusher.connection.bind(
            "pusher:connection_established",
            self._get_connection_handler(
                project_id=project_info.project_id,
                pusher=pusher,
                subscription=self.subscription,
            ),
        )
        pusher.connect()

        # Wait for connection to get established
        deadline = time.time() + timeout
        while time.time() < deadline:
            if not self.subscription.is_alive():
                time.sleep(0.5)
                continue

            self.subscription._pusher = pusher  # pylint: disable=protected-access
            return self.subscription
        raise ComposioSDKTimeoutError(
            "Timed out while waiting for trigger listener to be established"
        )


class Triggers(Resource):
    """Triggers (instance) class"""

    enable: t.Callable
    """Enables a trigger given its id"""

    disable: t.Callable
    """Disables a trigger given its id"""

    def __init__(self, client: HttpClient):
        """
        Initialize the triggers resource.

        :param client: The client to use for the triggers resource.
        """
        self._client = client
        self.list_enum = self._client.triggers_types.retrieve_enum
        self.get_type = self._client.triggers_types.retrieve
        self.list = self._client.triggers_types.list
        self.delete = self._client.trigger_instances.manage.delete
        self.enable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="enable",
        )
        self.disable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="disable",
        )

    def list_active(
        self,
        trigger_ids: t.Optional[list[str]] = None,
        trigger_names: t.Optional[list[str]] = None,
        auth_config_ids: t.Optional[list[str]] = None,
        connected_account_ids: t.Optional[list[str]] = None,
        show_disabled: t.Optional[bool] = None,
        limit: t.Optional[int] = None,
        page: t.Optional[int] = None,
    ):
        """
        List all active triggers

        :param trigger_ids: List of trigger IDs to filter by
        :param trigger_names: List of trigger names to filter by
        :param auth_config_ids: List of auth config IDs to filter by
        :param connected_account_ids: List of connected account IDs to filter by
        :param show_disabled: Whether to show disabled triggers
        :param limit: Limit the number of triggers to return
        :param page: Page number to return
        :return: List of active triggers
        """
        return self._client.trigger_instances.list_active(
            query_trigger_ids_1=trigger_ids,
            query_trigger_names_1=trigger_names,
            query_auth_config_ids_1=auth_config_ids,
            query_connected_account_ids_1=connected_account_ids,
            query_show_disabled_1=show_disabled,
            limit=limit or self._client.not_given,
            page=page or self._client.not_given,
        )

    @t.overload
    def create(
        self,
        slug: str,
        *,
        connected_account_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    @t.overload
    def create(
        self,
        slug: str,
        *,
        user_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    def create(
        self,
        slug: str,
        *,
        user_id: t.Optional[str] = None,
        connected_account_id: t.Optional[str] = None,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse:
        """
        Create a trigger instance

        :param slug: The slug of the trigger
        :param connected_account_id: The ID of the connected account
        :param trigger_config: The configuration of the trigger
        :return: The trigger instance
        """
        if user_id is not None:
            connected_account_id = self._get_connected_account_for_user(
                trigger=slug,
                user_id=user_id,
            )

        if connected_account_id is None:
            raise exceptions.InvalidParams(
                "please provide valid `connected_account` or `user_id`"
            )

        return self._client.trigger_instances.upsert(
            slug=slug,
            connected_account_id=connected_account_id,
            body_trigger_config_1=trigger_config or self._client.not_given,
        )

    def _get_connected_account_for_user(self, trigger: str, user_id: str) -> str:
        toolkit = self.get_type(slug=trigger).toolkit.slug
        connected_accounts = self._client.connected_accounts.list(
            toolkit_slugs=[toolkit]
        )
        if len(connected_accounts.items) == 0:
            raise exceptions.NoItemsFound(
                f"No connected accounts found for {trigger} and {user_id}"
            )

        account, *_ = sorted(
            connected_accounts.items,
            key=lambda x: x.created_at,
            reverse=True,
        )
        return account.id

    def subscribe(self, timeout: float = 15.0) -> TriggerSubscription:
        """
        Subscribe to a trigger and receive trigger events.

        :param timeout: The timeout to wait for the subscription to be established.
        :return: The trigger subscription handler.
        """
        return _SubcriptionBuilder(client=self._client).connect(timeout=timeout)
