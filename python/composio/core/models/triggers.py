from __future__ import annotations

import base64
import functools
import hashlib
import hmac
import json
import time
import traceback
import typing as t
import uuid
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from unittest import mock

import typing_extensions as te
from composio_client import Omit, omit
from composio_client.types import TriggersTypeRetrieveResponse
from pysher import Pusher
from pysher.channel import Channel as PusherChannel
from pysher.connection import Connection as PusherConnection

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import trigger_instance_upsert_response
from composio.core.models.base import Resource
from composio.core.models.internal import Internal
from composio.core.types import ToolkitVersionParam
from composio.exceptions import ComposioSDKTimeoutError
from composio.utils.logging import WithLogger
from composio.utils.pydantic import none_to_omit

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


class WebhookVersion(str, Enum):
    """Webhook payload version."""

    V1 = "V1"
    V2 = "V2"
    V3 = "V3"


class WebhookPayloadV1(te.TypedDict):
    """V1 webhook payload structure."""

    trigger_name: str
    connection_id: str
    trigger_id: str
    payload: t.Dict[str, t.Any]
    log_id: str


class WebhookPayloadV2(te.TypedDict):
    """V2 webhook payload structure."""

    type: str
    timestamp: str
    log_id: str
    data: t.Dict[str, t.Any]


class WebhookPayloadV3(te.TypedDict):
    """V3 webhook payload structure - generic envelope for all composio.* events."""

    id: str
    timestamp: str
    type: str  # Any composio.* event type (e.g., 'composio.trigger.message', 'composio.connected_account.expired')
    metadata: t.Dict[
        str, t.Any
    ]  # Shape varies by event type (trigger vs connection events)
    data: t.Dict[str, t.Any]


class WebhookTriggerPayloadV3Metadata(te.TypedDict):
    """V3 trigger-specific webhook payload metadata."""

    log_id: str
    trigger_slug: str
    trigger_id: str
    connected_account_id: str
    auth_config_id: str
    user_id: str


class WebhookTriggerPayloadV3(te.TypedDict):
    """V3 trigger-specific webhook payload structure."""

    id: str
    timestamp: str
    type: str
    metadata: WebhookTriggerPayloadV3Metadata
    data: t.Dict[str, t.Any]


WebhookPayload = t.Union[WebhookPayloadV1, WebhookPayloadV2, WebhookPayloadV3]


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


class VerifyWebhookResult(t.TypedDict):
    """Result of webhook verification."""

    version: WebhookVersion  # The webhook version (V1, V2, or V3)
    payload: TriggerEvent  # The parsed and normalized webhook payload
    raw_payload: WebhookPayload  # The original parsed payload


class WebhookSubscription(t.TypedDict, total=False):
    """Webhook subscription returned by the Composio API."""

    id: str
    webhook_url: str
    version: str
    enabled_events: t.List[str]
    secret: str
    created_at: str
    updated_at: str


DEFAULT_WEBHOOK_SUBSCRIPTION_EVENTS = ("composio.trigger.message",)
WEBHOOK_SUBSCRIPTIONS_PATH = "/api/v3.1/webhook_subscriptions"


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


# Realtime trigger frames can carry message bodies / PII, so the raw frame is
# never logged in full — only a bounded preview when it fails to parse.
_MAX_LOGGED_FRAME_CHARS = 512


def _truncate_frame(event: str) -> str:
    """Return a bounded preview of a raw frame for safe logging."""
    if len(event) <= _MAX_LOGGED_FRAME_CHARS:
        return event
    return f"{event[:_MAX_LOGGED_FRAME_CHARS]}… ({len(event)} chars total)"


def _coerce_str(value: t.Any) -> str:
    """Coerce a possibly-missing or non-string field to ``str``.

    Mirrors the TS SDK's ``toStringOrDefault`` so realtime/webhook frames that
    carry ``None`` or a non-string identity field don't later raise
    ``AttributeError`` on ``.lower()`` / ``.split()``. ``None`` maps to "".
    """
    return "" if value is None else str(value)


def _is_v3_envelope(data: t.Any) -> bool:
    """Return ``True`` if ``data`` is a modern V3 envelope.

    V3 payloads carry a ``type`` starting with ``composio.`` and a ``metadata``
    object, alongside top-level ``id`` and ``data`` keys. The same envelope is
    delivered over both the webhook channel and the realtime (Pusher) channel,
    so this is used to route either source through the V3 normalizer.
    """
    if not isinstance(data, dict):
        return False
    event_type = data.get("type", "")
    return (
        isinstance(event_type, str)
        and event_type.startswith("composio.")
        and isinstance(data.get("metadata"), dict)
        and "id" in data
        and "data" in data
    )


def _build_trigger_event_from_v3(data: WebhookPayloadV3) -> TriggerEvent:
    """Normalize a V3 envelope (webhook or realtime) into a ``TriggerEvent``.

    Trigger frames are identified by their envelope ``type``
    (``composio.trigger.message``), not by the presence of every metadata
    field. The trigger-specific metadata fields are then read best-effort and
    coerced to ``str`` so a frame that omits or mistypes one of them is still
    delivered rather than silently demoted to a non-trigger event or raising
    ``AttributeError`` on the toolkit-slug split.
    """
    metadata = data.get("metadata") or {}
    event_type = data.get("type", "")

    if event_type == "composio.trigger.message":
        trigger_id = _coerce_str(metadata.get("trigger_id"))
        trigger_slug = _coerce_str(metadata.get("trigger_slug"))
        user_id = _coerce_str(metadata.get("user_id"))
        connected_account_id = _coerce_str(metadata.get("connected_account_id"))
        auth_config_id = _coerce_str(metadata.get("auth_config_id"))
        toolkit_slug = (
            trigger_slug.split("_")[0].upper() if "_" in trigger_slug else "UNKNOWN"
        )
        return t.cast(
            TriggerEvent,
            {
                "id": trigger_id,
                "uuid": trigger_id,
                "user_id": user_id,
                "toolkit_slug": toolkit_slug,
                "trigger_slug": trigger_slug,
                "metadata": {
                    "id": trigger_id,
                    "uuid": trigger_id,
                    "toolkit_slug": toolkit_slug,
                    "trigger_slug": trigger_slug,
                    "trigger_data": None,
                    "trigger_config": {},
                    "connected_account": {
                        "id": connected_account_id,
                        "uuid": connected_account_id,
                        "auth_config_id": auth_config_id,
                        "auth_config_uuid": auth_config_id,
                        "user_id": user_id,
                        "status": "ACTIVE",
                    },
                },
                "payload": data.get("data", {}),
                "original_payload": None,
            },
        )

    # Non-trigger V3 event (e.g., connection expired)
    event_id = _coerce_str(data.get("id"))
    return t.cast(
        TriggerEvent,
        {
            "id": event_id,
            "uuid": event_id,
            "user_id": "",
            "toolkit_slug": "COMPOSIO",
            "trigger_slug": event_type,
            "metadata": {
                "id": event_id,
                "uuid": event_id,
                "toolkit_slug": "COMPOSIO",
                "trigger_slug": event_type,
                "trigger_data": None,
                "trigger_config": {},
                "connected_account": {
                    "id": "",
                    "uuid": "",
                    "auth_config_id": "",
                    "auth_config_uuid": "",
                    "user_id": "",
                    "status": "ACTIVE",
                },
            },
            "payload": data.get("data", {}),
            "original_payload": data,
        },
    )


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
        """Parse a realtime event payload into a ``TriggerEvent``.

        The realtime (Pusher) channel delivers either the modern V3 envelope
        (for projects on webhook version V3) or the legacy envelope (for V1/V2
        projects). Both shapes are handled here. Any unrecognized or malformed
        frame is logged and skipped (returns ``None``) rather than raising, so a
        single bad frame cannot tear down the subscription.
        """
        try:
            data = json.loads(event)
        except Exception as e:
            self.logger.warning(f"Error decoding payload: {e}")
            return None

        try:
            # V3 envelope — same shape as the V3 webhook payload.
            if _is_v3_envelope(data):
                return _build_trigger_event_from_v3(t.cast(WebhookPayloadV3, data))

            # Legacy envelope (V1/V2 projects).
            legacy = t.cast(_TriggerData, data)
            return t.cast(
                TriggerEvent,
                {
                    "id": legacy["metadata"]["nanoId"],
                    "uuid": legacy["metadata"]["id"],
                    "user_id": legacy["metadata"]["connection"]["clientUniqueUserId"],
                    "toolkit_slug": legacy["appName"],
                    "trigger_slug": legacy["metadata"]["triggerName"],
                    "metadata": {
                        "id": legacy["metadata"]["nanoId"],
                        "uuid": legacy["metadata"]["id"],
                        "toolkit_slug": legacy["appName"],
                        "trigger_slug": legacy["metadata"]["triggerName"],
                        "trigger_data": legacy["metadata"].get("triggerData"),
                        "trigger_config": legacy["metadata"]["triggerConfig"],
                        "connected_account": {
                            "id": legacy["metadata"]["connection"][
                                "connectedAccountNanoId"
                            ],
                            "uuid": legacy["metadata"]["connection"]["id"],
                            "auth_config_id": legacy["metadata"]["connection"][
                                "authConfigNanoId"
                            ],
                            "auth_config_uuid": legacy["metadata"]["connection"][
                                "integrationId"
                            ],
                            "user_id": legacy["metadata"]["connection"][
                                "clientUniqueUserId"
                            ],
                            "status": legacy["metadata"]["connection"]["status"],
                        },
                    },
                    "payload": legacy.get("payload"),
                    "original_payload": legacy.get("originalPayload"),
                },
            )
        except Exception as e:
            # A single malformed frame must never propagate into pysher's
            # dispatch loop (which calls callbacks with no try/except) and tear
            # down the subscription, so catch broadly — AttributeError and
            # others, not just KeyError/TypeError — and skip the frame.
            self.logger.warning(f"Error parsing trigger payload: {e}")
            return None

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
            if value is None:
                # No filter set for this field — nothing to match against.
                continue

            # ``check`` is str()-wrapped because realtime frames may carry
            # non-string identity fields; an empty event-side value is treated
            # as a non-match so synthesized "" fields don't fail open into a
            # filter that happens to be "".
            check_str = str(check)
            if check_str and str(value).lower() == check_str.lower():
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
            # _parse_payload already logged the specific reason; here we only
            # note that the frame was skipped, with a bounded preview so a
            # PII-bearing frame isn't dumped in full.
            self.logger.error(
                f"Skipping unparseable trigger frame: {_truncate_frame(event)}"
            )
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

    def __init__(
        self,
        client: HttpClient,
        toolkit_versions: t.Optional[ToolkitVersionParam] = None,
    ):
        """
        Initialize the triggers resource.

        :param client: The client to use for the triggers resource.
        :param toolkit_versions: The versions of the toolkits to use. Defaults to 'latest' if not provided.
        """
        self._client = client
        self._toolkit_versions = toolkit_versions
        self.list_enum = self._client.triggers_types.retrieve_enum
        self.delete = self._client.trigger_instances.manage.delete
        self.enable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="enable",
        )
        self.disable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="disable",
        )

    def set_webhook_subscription(
        self,
        *,
        webhook_url: str,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str] = WebhookVersion.V3,
    ) -> WebhookSubscription:
        """
        Create or update the project webhook subscription used for webhook delivery.

        If a subscription already exists, the first subscription is updated. Otherwise a
        new subscription is created. By default this subscribes to V3 trigger message
        events.

        Example:
            composio.triggers.set_webhook_subscription(
                webhook_url=f"{APP_URL}/webhooks/composio",
            )
        """
        if not webhook_url:
            raise exceptions.ValidationError("please provide a valid `webhook_url`")

        events = list(
            DEFAULT_WEBHOOK_SUBSCRIPTION_EVENTS
            if enabled_events is None
            else enabled_events
        )
        if len(events) == 0:
            raise exceptions.ValidationError(
                "please provide at least one enabled event"
            )

        version_value = (
            version.value if isinstance(version, WebhookVersion) else version
        )
        body = {
            "webhook_url": webhook_url,
            "enabled_events": events,
            "version": version_value,
        }

        existing = self._client.get(
            WEBHOOK_SUBSCRIPTIONS_PATH,
            cast_to=object,
            options={"params": {"limit": 1}},
        )
        subscription_id = self._first_webhook_subscription_id(existing)

        if subscription_id:
            return self._normalize_webhook_subscription(
                self._client.patch(
                    f"{WEBHOOK_SUBSCRIPTIONS_PATH}/{subscription_id}",
                    cast_to=object,
                    body=body,
                )
            )

        return self._normalize_webhook_subscription(
            self._client.post(
                WEBHOOK_SUBSCRIPTIONS_PATH,
                cast_to=object,
                body=body,
            ),
        )

    @staticmethod
    def _normalize_webhook_subscription(raw: object) -> WebhookSubscription:
        """Build a typed :class:`WebhookSubscription` from the raw API response.

        Maps explicitly (accepting either snake_case or camelCase wire keys)
        instead of ``cast``-ing the raw object, so the returned dict always
        matches the declared shape and a shift in the wire format surfaces as a
        normalized field rather than a ``KeyError`` at the call site.
        """
        data = raw if isinstance(raw, dict) else {}

        def _first_str(*keys: str) -> t.Optional[str]:
            for key in keys:
                value = data.get(key)
                if isinstance(value, str) and value:
                    return value
            return None

        def _str_list(*keys: str) -> t.List[str]:
            for key in keys:
                value = data.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, str)]
            return []

        result: WebhookSubscription = {
            "id": _first_str("id") or "",
            "webhook_url": _first_str("webhook_url", "webhookUrl") or "",
            "version": _first_str("version") or WebhookVersion.V3.value,
            "enabled_events": _str_list("enabled_events", "enabledEvents"),
        }
        secret = _first_str("secret")
        if secret is not None:
            result["secret"] = secret
        created_at = _first_str("created_at", "createdAt")
        if created_at is not None:
            result["created_at"] = created_at
        updated_at = _first_str("updated_at", "updatedAt")
        if updated_at is not None:
            result["updated_at"] = updated_at
        return result

    @staticmethod
    def _first_webhook_subscription_id(response: object) -> t.Optional[str]:
        if not isinstance(response, dict):
            return None

        items = response.get("items")
        if not isinstance(items, list) or len(items) == 0:
            return None

        first = items[0]
        if not isinstance(first, dict):
            return None

        subscription_id = first.get("id")
        return subscription_id if isinstance(subscription_id, str) else None

    def get_type(self, slug: str) -> TriggersTypeRetrieveResponse:
        """
        Get a trigger type by its slug
        Uses the global toolkit version provided when initializing composio instance to fetch trigger for specific toolkit version

        :param slug: The slug of the trigger type
        :return: The trigger type
        """
        return self._client.triggers_types.retrieve(
            slug=slug, toolkit_versions=none_to_omit(self._toolkit_versions)
        )

    def list_active(
        self,
        trigger_ids: t.Optional[list[str]] = None,
        trigger_names: t.Optional[list[str]] = None,
        auth_config_ids: t.Optional[list[str]] = None,
        connected_account_ids: t.Optional[list[str]] = None,
        show_disabled: t.Optional[bool] = None,
        limit: t.Optional[int] = None,
        cursor: t.Optional[str] = None,
    ):
        """
        List all active triggers

        :param trigger_ids: List of trigger IDs to filter by
        :param trigger_names: List of trigger names to filter by
        :param auth_config_ids: List of auth config IDs to filter by
        :param connected_account_ids: List of connected account IDs to filter by
        :param show_disabled: Whether to show disabled triggers
        :param limit: Limit the number of triggers to return
        :param cursor: Cursor for pagination. Use the nextCursor from the response to get the next page.
        :return: List of active triggers
        """
        return self._client.trigger_instances.list_active(
            query_trigger_ids_1=trigger_ids,
            query_trigger_names_1=trigger_names,
            query_auth_config_ids_1=auth_config_ids,
            query_connected_account_ids_1=connected_account_ids,
            query_show_disabled_1=show_disabled,
            limit=limit if limit is not None else omit,
            cursor=cursor if cursor is not None else omit,
        )

    def list(
        self,
        *,
        cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
        toolkit_slugs: t.Optional[list[str]] = None,
    ):
        """
        List all the trigger types.

        :param cursor: The cursor for pagination
        :param limit: The maximum number of trigger types to return
        :param toolkit_slugs: Filter by toolkit slugs
        :return: The list of trigger types
        """
        return self._client.triggers_types.list(
            cursor=none_to_omit(cursor),
            limit=none_to_omit(limit),
            toolkit_slugs=none_to_omit(toolkit_slugs),
            toolkit_versions=none_to_omit(self._toolkit_versions),
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

        # Forward user_id so 2FA-enabled projects can verify the pinned connected
        # account belongs to this user (backends without 2FA ignore it). Sent via
        # extra_body until composio-client regenerates with the field.
        extra_body = {"user_id": user_id} if user_id is not None else {}

        return self._client.trigger_instances.upsert(
            slug=slug,
            connected_account_id=connected_account_id,
            toolkit_versions=self._toolkit_versions,
            body_trigger_config_1=(
                trigger_config if trigger_config is not None else omit
            ),
            extra_body=extra_body,
        )

    def _get_connected_account_for_user(self, trigger: str, user_id: str) -> str:
        toolkit = self.get_type(slug=trigger).toolkit.slug
        connected_accounts = self._client.connected_accounts.list(
            toolkit_slugs=[toolkit],
            user_ids=[user_id],
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

    def verify_webhook(
        self,
        *,
        id: str,
        payload: str,
        secret: str,
        signature: str,
        timestamp: str,
        tolerance: int = 300,
    ) -> VerifyWebhookResult:
        """
        Verify an incoming webhook payload and signature.

        This method validates that the webhook request is authentic by:
        1. Validating the webhook timestamp is within the tolerance window
        2. Verifying the HMAC-SHA256 signature using the correct algorithm
        3. Parsing the payload and detecting the webhook version (V1, V2, or V3)

        :param id: The webhook message ID from the 'webhook-id' header (format: 'msg_xxx')
        :param payload: The raw webhook payload as a string (request body)
        :param secret: The webhook secret used to sign the payload (from Composio dashboard)
        :param signature: The signature from the 'webhook-signature' header (format: 'v1,base64EncodedSignature')
        :param timestamp: The webhook timestamp from the 'webhook-timestamp' header (Unix seconds)
        :param tolerance: Maximum allowed age of the webhook in seconds (default: 300 = 5 minutes).
                         Set to 0 to disable timestamp validation.
        :return: VerifyWebhookResult containing version, normalized payload, and raw payload
        :raises WebhookSignatureVerificationError: If the signature verification fails
        :raises WebhookPayloadError: If the payload cannot be parsed or is invalid

        Example:
            # In a Flask webhook handler
            @app.route('/webhook', methods=['POST'])
            def webhook():
                try:
                    result = composio.triggers.verify_webhook(
                        id=request.headers.get('webhook-id', ''),
                        payload=request.get_data(as_text=True),
                        signature=request.headers.get('webhook-signature', ''),
                        timestamp=request.headers.get('webhook-timestamp', ''),
                        secret=os.environ['COMPOSIO_WEBHOOK_SECRET'],
                    )

                    # Process the verified payload
                    print(f"Version: {result['version']}")
                    print(f"Received trigger: {result['payload']['trigger_slug']}")
                    return 'OK', 200
                except WebhookSignatureVerificationError:
                    return 'Unauthorized', 401
        """
        # Validate timestamp if tolerance is set
        if tolerance > 0:
            self._validate_webhook_timestamp_header(timestamp, tolerance)

        # Verify signature using the correct algorithm
        self._verify_webhook_signature(
            webhook_id=id,
            webhook_timestamp=timestamp,
            payload=payload,
            signature=signature,
            secret=secret,
        )

        # Parse and detect version
        version, raw_payload, normalized_payload = self._parse_webhook_payload(payload)

        return {
            "version": version,
            "payload": normalized_payload,
            "raw_payload": raw_payload,
        }

    def parse(
        self,
        request: t.Any = None,
        *,
        body: t.Union[str, bytes, t.Mapping[str, t.Any], None] = None,
        headers: t.Union[t.Mapping[str, t.Any], None] = None,
        verify_secret: t.Union[str, None, Omit] = omit,
        tolerance: int = 300,
    ) -> VerifyWebhookResult:
        """
        Parse an incoming webhook request into a typed, normalized trigger payload.

        Pass a framework request object, or pass ``body=`` and ``headers=``
        explicitly. When ``verify_secret`` is provided, the SDK verifies the
        webhook signature before returning the normalized trigger payload. When
        it is omitted, the SDK parses the body without verifying the signature.

        ``request`` may be any object exposing the request body and headers, such
        as a Flask, Django, or FastAPI request. The body is read from ``.body``
        (or ``.data`` / ``.get_data()``), and the headers are read from
        ``.headers``. Because this SDK is synchronous, async frameworks must pass
        an already-read raw body, for example via ``body=await request.body()``.

        :param request: The incoming webhook request object (Flask/Django/FastAPI)
        :param body: The raw request body (str/bytes/parsed mapping); overrides ``request``
        :param headers: The request headers as a mapping; overrides ``request``
        :param verify_secret: Webhook secret; when set, the signature is verified.
            Omit it entirely to parse without verification. Passing a present-but-empty
            value (e.g. an unset ``COMPOSIO_WEBHOOK_SECRET``) raises rather than
            silently skipping verification.
        :param tolerance: Max webhook age in seconds (only used when verifying)
        :return: VerifyWebhookResult containing version, normalized payload, and raw payload
        :raises ValidationError: If ``verify_secret`` is empty, or is set but signature headers are missing
        :raises WebhookSignatureVerificationError: If signature verification fails
        :raises WebhookPayloadError: If the payload cannot be parsed

        Example:
            # Flask: verify the signature
            @app.route('/webhooks/composio', methods=['POST'])
            def webhook():
                try:
                    result = composio.triggers.parse(
                        request,
                        verify_secret=os.environ['COMPOSIO_WEBHOOK_SECRET'],
                    )
                    print(f"Trigger: {result['payload']['trigger_slug']}")
                    print(f"Event data: {result['payload']['payload']}")
                    return 'OK', 200
                except exceptions.WebhookSignatureVerificationError:
                    return 'Unauthorized', 401

            # FastAPI: parse without verifying after reading the async body
            @app.post('/webhooks/composio')
            async def webhook(request: Request):
                raw = await request.body()
                result = composio.triggers.parse(body=raw, headers=request.headers)
                return {'trigger': result['payload']['trigger_slug']}
        """
        raw_body = body if body is not None else self._extract_request_body(request)
        raw_headers = (
            headers if headers is not None else getattr(request, "headers", None)
        )

        payload = self._body_to_str(raw_body)

        # Distinguish "caller omitted verify_secret" (explicit opt-out) from
        # "caller passed verify_secret but it resolved to empty" (almost always
        # an unset COMPOSIO_WEBHOOK_SECRET). The latter must fail loudly rather
        # than silently skip verification and accept forged events.
        if isinstance(verify_secret, Omit):
            version, raw_payload, normalized_payload = self._parse_webhook_payload(
                payload
            )
            return {
                "version": version,
                "payload": normalized_payload,
                "raw_payload": raw_payload,
            }

        if not verify_secret:
            raise exceptions.ValidationError(
                "Cannot verify webhook: `verify_secret` was provided but is empty — "
                "your COMPOSIO_WEBHOOK_SECRET is likely unset. Set the secret, or omit "
                "`verify_secret` entirely to parse without verification."
            )

        # Secret provided: signature headers are required to verify.
        webhook_id = self._get_header(raw_headers, "webhook-id")
        timestamp = self._get_header(raw_headers, "webhook-timestamp")
        signature = self._get_header(raw_headers, "webhook-signature")

        missing = [
            name
            for name, value in (
                ("webhook-id", webhook_id),
                ("webhook-timestamp", timestamp),
                ("webhook-signature", signature),
            )
            if not value
        ]
        if missing:
            raise exceptions.ValidationError(
                "Cannot verify webhook: missing signature header(s) "
                f"{', '.join(repr(name) for name in missing)}. "
                "Pass the raw, unparsed request body and ensure the Composio "
                "signature headers (webhook-id, webhook-timestamp, "
                "webhook-signature) are forwarded to triggers.parse(). "
                "To parse without verifying, omit `verify_secret`."
            )

        return self.verify_webhook(
            id=t.cast(str, webhook_id),
            payload=payload,
            secret=verify_secret,
            signature=t.cast(str, signature),
            timestamp=t.cast(str, timestamp),
            tolerance=tolerance,
        )

    @staticmethod
    def _extract_request_body(request: t.Any) -> t.Union[str, bytes, None]:
        """Read the raw body from a framework request object.

        Tries the common attributes used by Flask (``get_data``/``data``),
        Django (``body``) and similar. Returns ``None`` when nothing usable is
        found so the caller surfaces a clear parse error.
        """
        if request is None:
            return None

        # Flask: request.get_data() returns the raw body bytes.
        get_data = getattr(request, "get_data", None)
        if callable(get_data):
            return get_data()

        for attr in ("body", "data"):
            value = getattr(request, attr, None)
            if value is not None and not callable(value):
                return value

        return None

    @staticmethod
    def _body_to_str(body: t.Union[str, bytes, t.Mapping[str, t.Any], None]) -> str:
        """Coerce a body (str, bytes, parsed mapping, or None) into a raw string."""
        if body is None:
            return ""
        if isinstance(body, str):
            return body
        if isinstance(body, (bytes, bytearray)):
            return bytes(body).decode("utf-8")
        # Already-parsed mapping (e.g. a framework that pre-parsed JSON). Note:
        # re-serializing cannot reproduce the exact signed bytes, so signature
        # verification on a pre-parsed body is best-effort only.
        return json.dumps(body)

    @staticmethod
    def _get_header(headers: t.Any, name: str) -> t.Optional[str]:
        """Read a header value case-insensitively from a headers mapping.

        Supports both plain ``dict`` headers and framework header objects
        (Werkzeug/Django ``HttpHeaders``) that expose a ``get`` method, which is
        already case-insensitive.
        """
        if headers is None:
            return None

        get = getattr(headers, "get", None)
        if callable(get):
            value = get(name)
            if value is not None:
                return str(value)

        # Fall back to a manual case-insensitive scan for plain mappings.
        try:
            items = headers.items()
        except AttributeError:
            return None

        target = name.lower()
        for key, value in items:
            if isinstance(key, str) and key.lower() == target:
                return str(value) if value is not None else None
        return None

    def _verify_webhook_signature(
        self,
        *,
        webhook_id: str,
        webhook_timestamp: str,
        payload: str,
        signature: str,
        secret: str,
    ) -> None:
        """
        Verify the HMAC-SHA256 signature of a webhook payload.

        The signature is computed as: HMAC-SHA256(webhookId.webhookTimestamp.payload, secret)
        and then base64 encoded with a 'v1,' prefix.

        :param webhook_id: The webhook message ID from header
        :param webhook_timestamp: The webhook timestamp from header
        :param payload: The raw webhook payload
        :param signature: The signature to verify (format: 'v1,base64EncodedSignature')
        :param secret: The webhook secret
        :raises WebhookSignatureVerificationError: If verification fails
        """
        if not payload:
            raise exceptions.WebhookSignatureVerificationError(
                "No webhook payload was provided."
            )

        if not signature:
            raise exceptions.WebhookSignatureVerificationError(
                "No signature header value was provided. "
                "Please pass the value of the webhook signature header."
            )

        if not secret:
            raise exceptions.WebhookSignatureVerificationError(
                "No webhook secret was provided. "
                "You can find your webhook secret in your Composio dashboard."
            )

        if not webhook_id:
            raise exceptions.WebhookSignatureVerificationError(
                "No webhook ID was provided. "
                "Please pass the value of the 'webhook-id' header."
            )

        if not webhook_timestamp:
            raise exceptions.WebhookSignatureVerificationError(
                "No webhook timestamp was provided. "
                "Please pass the value of the 'webhook-timestamp' header."
            )

        # Parse signature header - format is "v1,base64Sig" or "v1,sig1 v1,sig2"
        # Split by space to handle multiple signatures
        signature_parts = signature.split(" ")
        v1_signatures: t.List[str] = []

        for part in signature_parts:
            if part.startswith("v1,"):
                v1_signatures.append(part[3:])  # Remove "v1," prefix

        if not v1_signatures:
            raise exceptions.WebhookSignatureVerificationError(
                "No valid v1 signature found in the signature header. "
                "Expected format: 'v1,base64EncodedSignature'"
            )

        # Construct the string to sign: webhookId.webhookTimestamp.payload
        to_sign = f"{webhook_id}.{webhook_timestamp}.{payload}"

        # Compute expected signature
        expected_signature_bytes = hmac.new(
            key=secret.encode("utf-8"),
            msg=to_sign.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        expected_signature_b64 = base64.b64encode(expected_signature_bytes).decode(
            "utf-8"
        )

        # Check if any of the provided signatures match (timing-safe)
        for provided_sig in v1_signatures:
            try:
                if hmac.compare_digest(provided_sig, expected_signature_b64):
                    return  # Signature is valid
            except Exception:
                continue  # Invalid signature format, try next

        raise exceptions.WebhookSignatureVerificationError(
            "The signature provided is invalid."
        )

    def _validate_webhook_timestamp_header(
        self, timestamp: str, tolerance: int
    ) -> None:
        """
        Validate that the webhook timestamp header is within the allowed tolerance.

        :param timestamp: The webhook timestamp from header (Unix seconds)
        :param tolerance: Maximum allowed age in seconds
        :raises WebhookSignatureVerificationError: If timestamp is outside tolerance
        :raises WebhookPayloadError: If timestamp format is invalid
        """
        try:
            timestamp_seconds = int(timestamp)
        except (ValueError, TypeError) as e:
            raise exceptions.WebhookPayloadError(
                f"Invalid webhook timestamp: {timestamp}. "
                "Expected Unix timestamp in seconds."
            ) from e

        current_time = int(time.time())
        time_difference = abs(current_time - timestamp_seconds)

        if time_difference > tolerance:
            raise exceptions.WebhookSignatureVerificationError(
                f"The webhook timestamp is outside the allowed tolerance. "
                f"The webhook was sent {time_difference} seconds ago, "
                f"but the maximum allowed age is {tolerance} seconds."
            )

    def _parse_webhook_payload(
        self, payload: str
    ) -> t.Tuple[WebhookVersion, WebhookPayload, TriggerEvent]:
        """
        Parse webhook payload and detect version.

        :param payload: The raw webhook payload string
        :return: Tuple of (version, raw_payload, normalized_payload)
        :raises WebhookPayloadError: If payload cannot be parsed
        """
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as e:
            raise exceptions.WebhookPayloadError(
                f"Failed to parse webhook payload as JSON: {e}"
            ) from e

        # Try V3 first — same envelope the realtime channel uses, so reuse the
        # shared detector/normalizer to keep the two paths from drifting.
        if _is_v3_envelope(data):
            return (
                WebhookVersion.V3,
                t.cast(WebhookPayloadV3, data),
                _build_trigger_event_from_v3(t.cast(WebhookPayloadV3, data)),
            )

        # Try V2 (has 'type', 'timestamp', 'data' with nested fields)
        if (
            isinstance(data, dict)
            and "type" in data
            and "timestamp" in data
            and "data" in data
            and isinstance(data.get("data"), dict)
            and "connection_id" in data.get("data", {})
        ):
            return (
                WebhookVersion.V2,
                t.cast(WebhookPayloadV2, data),
                self._normalize_v2_payload(t.cast(WebhookPayloadV2, data)),
            )

        # Try V1 (has 'trigger_name', 'connection_id', 'trigger_id', 'payload')
        if (
            isinstance(data, dict)
            and "trigger_name" in data
            and "connection_id" in data
            and "trigger_id" in data
            and "payload" in data
        ):
            return (
                WebhookVersion.V1,
                t.cast(WebhookPayloadV1, data),
                self._normalize_v1_payload(t.cast(WebhookPayloadV1, data)),
            )

        raise exceptions.WebhookPayloadError(
            "Webhook payload does not match any known version (V1, V2, or V3). "
            "Please ensure the payload structure is correct."
        )

    def _normalize_v1_payload(self, data: WebhookPayloadV1) -> TriggerEvent:
        """Normalize V1 payload to TriggerEvent format."""
        return t.cast(
            TriggerEvent,
            {
                "id": data["trigger_id"],
                "uuid": data["trigger_id"],
                "user_id": "",  # V1 doesn't have user_id
                "toolkit_slug": "",  # V1 doesn't have toolkit_slug
                "trigger_slug": data["trigger_name"],
                "metadata": {
                    "id": data["trigger_id"],
                    "uuid": data["trigger_id"],
                    "toolkit_slug": "",
                    "trigger_slug": data["trigger_name"],
                    "trigger_data": None,
                    "trigger_config": {},
                    "connected_account": {
                        "id": data["connection_id"],
                        "uuid": data["connection_id"],
                        "auth_config_id": "",
                        "auth_config_uuid": "",
                        "user_id": "",
                        "status": "ACTIVE",
                    },
                },
                "payload": data["payload"],
                "original_payload": None,
            },
        )

    def _normalize_v2_payload(self, data: WebhookPayloadV2) -> TriggerEvent:
        """Normalize V2 payload to TriggerEvent format."""
        payload_data = data["data"]
        return t.cast(
            TriggerEvent,
            {
                "id": payload_data.get(
                    "trigger_nano_id", payload_data.get("trigger_id", "")
                ),
                "uuid": payload_data.get("trigger_id", ""),
                "user_id": payload_data.get("user_id", ""),
                "toolkit_slug": data["type"].upper() if data.get("type") else "",
                "trigger_slug": data["type"].upper() if data.get("type") else "",
                "metadata": {
                    "id": payload_data.get("trigger_nano_id", ""),
                    "uuid": payload_data.get("trigger_id", ""),
                    "toolkit_slug": data["type"].upper() if data.get("type") else "",
                    "trigger_slug": data["type"].upper() if data.get("type") else "",
                    "trigger_data": None,
                    "trigger_config": {},
                    "connected_account": {
                        "id": payload_data.get("connection_nano_id", ""),
                        "uuid": payload_data.get("connection_id", ""),
                        "auth_config_id": "",
                        "auth_config_uuid": "",
                        "user_id": payload_data.get("user_id", ""),
                        "status": "ACTIVE",
                    },
                },
                "payload": {
                    k: v
                    for k, v in payload_data.items()
                    if k
                    not in (
                        "connection_id",
                        "connection_nano_id",
                        "trigger_nano_id",
                        "trigger_id",
                        "user_id",
                    )
                },
                "original_payload": None,
            },
        )
