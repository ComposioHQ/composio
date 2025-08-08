import json
import os
import shutil
import threading
import time
import typing as t
from pathlib import Path

from composio.client import Composio, enums
from composio.client.collections import ActionModel, AppModel, TriggerModel
from composio.client.enums.base import (
    ACTIONS_CACHE,
    ACTIONS_ETAG,
    APPS_CACHE,
    APPS_ETAG,
    TAGS_CACHE,
    TRIGGERS_CACHE,
    TRIGGERS_ETAG,
    AppData,
    TriggerData,
    create_action,
    replacement_action_name,
)
from composio.exceptions import ApiKeyNotProvidedError
from composio.tools.local import ToolRegistry, load_local_tools
from composio.utils import get_enum_key
from composio.utils.logging import get_logger


EnumModels = t.Union[AppModel, ActionModel, TriggerModel]

logger = get_logger(__name__)

_cache_checked = False

NO_CACHE_REFRESH = os.getenv("COMPOSIO_NO_CACHE_REFRESH", "false") == "true"


def _is_update_is_required(file: Path, etag: t.Callable[[], str]) -> bool:
    _etag = etag()
    if not file.exists():
        file.write_text(_etag)
        return True

    if file.read_text() == _etag:
        return False

    file.write_text(_etag)
    return True


def filter_non_beta_items(items: t.Sequence[EnumModels]) -> t.List:
    filtered_items: t.List[EnumModels] = []
    for item in items:
        if not item.name.lower().endswith("beta"):
            filtered_items.append(item)

    seen: t.Set[str] = set()
    unique_items: t.List[EnumModels] = []
    for item in filtered_items:
        if item.name not in seen:
            unique_items.append(item)
            seen.add(item.name)

    return unique_items


def update_apps(
    client: Composio,
    beta: bool = False,
    force: bool = False,
) -> None:
    """Update apps."""
    if not force and not _is_update_is_required(
        file=APPS_ETAG,
        etag=client.apps.get_etag,
    ):
        logger.info("Apps cache does not require update!")
        return

    logger.info("Updating apps cache...")
    shutil.rmtree(APPS_CACHE, ignore_errors=True)
    apps = sorted(client.apps.get(), key=lambda x: x.key)
    if not beta:
        apps = filter_non_beta_items(apps)
    _update_apps_cache(apps=apps)


def update_actions(
    client: Composio,
    beta: bool = False,
    force: bool = False,
) -> None:
    """Update actions and tags."""
    if not force and not _is_update_is_required(
        file=ACTIONS_ETAG,
        etag=client.actions.get_etag,
    ):
        logger.info("Actions cache does not require update!")
        return

    logger.info("Updating actions cache...")
    actions = sorted(
        client.actions.get(allow_all=True),
        key=lambda x: f"{x.appName}_{x.name}",
    )
    if not beta:
        actions = filter_non_beta_items(actions)

    shutil.rmtree(TAGS_CACHE, ignore_errors=True)
    _update_tags_cache(actions=actions)

    shutil.rmtree(ACTIONS_CACHE, ignore_errors=True)
    _update_actions_cache(actions=actions)


def update_triggers(
    client: Composio,
    beta: bool = False,
    force: bool = False,
) -> None:
    """Update triggers."""
    if not force and not _is_update_is_required(
        file=TRIGGERS_ETAG,
        etag=client.triggers.get_etag,
    ):
        logger.info("Triggers cache does not require update!")
        return

    logger.info("Updating triggers cache...")
    triggers = sorted(client.triggers.get(), key=lambda x: f"{x.appKey}_{x.name}")
    if not beta:
        triggers = filter_non_beta_items(triggers)

    shutil.rmtree(TRIGGERS_CACHE, ignore_errors=True)
    _update_triggers_cache(triggers=triggers)


def _create_local_apps_cache(registry: ToolRegistry):
    processed = []
    for tool in registry["local"].values():
        if tool.enum in processed:
            continue

        processed.append(tool.enum)
        enums.base.AppData(
            name=tool.name,
            path=enums.base.APPS_CACHE / tool.enum,
            is_local=True,
        ).store()


def _update_apps_cache(apps: t.List[AppModel]) -> None:
    """Create App enum class."""
    app_names = []
    enums.base.APPS_CACHE.mkdir(
        parents=True,
        exist_ok=True,
    )
    for app in apps:
        app_names.append(
            get_enum_key(
                name=app.key.lower().replace(" ", "_").replace("-", "_"),
            )
        )
        enums.base.AppData(
            name=app.name,
            path=enums.base.APPS_CACHE / app_names[-1],
            is_local=False,
        ).store()

    _create_local_apps_cache(registry=load_local_tools())


def _create_local_actions_cache(registry: ToolRegistry):
    processed = []
    for tool in registry["local"].values():
        if tool.name in processed:
            continue

        processed.append(tool.name)
        for actcls in tool.actions():
            enums.base.ActionData(
                name=actcls.enum,
                app=tool.name,
                tags=actcls.tags(),
                no_auth=True,
                is_local=True,
                path=enums.base.ACTIONS_CACHE / actcls.enum,
                shell=False,
            ).store()


def _update_actions_cache(actions: t.List[ActionModel]) -> None:
    """Get Action enum."""
    enums.base.ACTIONS_CACHE.mkdir(parents=True, exist_ok=True)
    deprecated = {}
    action_names = []

    for action in actions:
        new_action_name = replacement_action_name(
            action.description or "",
            action.appName,
        )
        if new_action_name is not None:
            replaced_by = deprecated[get_enum_key(name=action.name)] = new_action_name
        else:
            action_names.append(get_enum_key(name=action.name))
            replaced_by = None

        # TODO: there is duplicate ActionData creation code in
        # `load_from_runtime` and `fetch_and_cache` in client/enums/action.py
        enums.base.ActionData(
            name=action.name,
            app=action.appName,
            tags=action.tags,
            no_auth=action.no_auth,
            is_local=False,
            path=enums.base.ACTIONS_CACHE / get_enum_key(name=action.name),
            replaced_by=replaced_by,
        ).store()

    _create_local_actions_cache(registry=load_local_tools())


def _update_tags_cache(actions: t.List[ActionModel]) -> None:
    """Create Tag enum class."""
    enums.base.TAGS_CACHE.mkdir(parents=True, exist_ok=True)
    tag_map: t.Dict[str, t.Set[str]] = {}
    for action in actions:
        if action.appName not in tag_map:
            tag_map[action.appName] = set()
        tag_map[action.appName].update(action.tags or [])

    tag_names = ["DEFAULT"]
    for app_name in sorted(tag_map):
        for tag in sorted(tag_map[app_name]):
            tag_name = get_enum_key(name=f"{app_name}_{tag}")
            tag_names.append(tag_name)
            enums.base.TagData(
                app=app_name,
                value=tag,
                path=enums.base.TAGS_CACHE / tag_names[-1],
            ).store()

    enums.base.TagData(
        app="default",
        value="important",
        path=enums.base.TAGS_CACHE / "DEFAULT",
    )


def _update_triggers_cache(triggers: t.List[TriggerModel]) -> None:
    """Get Trigger enum."""
    enums.base.TRIGGERS_CACHE.mkdir(exist_ok=True)
    for trigger in triggers:
        enums.base.TriggerData(
            name=trigger.name,
            app=trigger.appKey,
            path=enums.base.TRIGGERS_CACHE / get_enum_key(name=trigger.name),
        ).store()


def _handle_exceptions(f):
    def _wrapper(*args, **kwargs):
        try:
            f(*args, **kwargs)
        except ApiKeyNotProvidedError:
            logger.warning("API Key not provided, skipping cache refresh")

    return _wrapper


@_handle_exceptions
def _check_and_refresh_actions(client: Composio):
    local_actions = set()
    if enums.base.ACTIONS_CACHE.exists():
        for action in enums.base.ACTIONS_CACHE.iterdir():
            action_data = json.loads(action.read_text())
            if action_data["is_local"]:
                continue

            # The action file could be old. If it doesn't have a
            # replaced_by field, we want to overwrite it.
            if "replaced_by" not in action_data:
                action.unlink()
                continue
            local_actions.add(action.stem.upper())

    api_actions = client.actions.list_enums()
    actions_to_update = set(api_actions) - set(local_actions)
    actions_to_delete = set(local_actions) - set(api_actions)
    if actions_to_delete:
        logger.debug("Stale actions: %s", actions_to_delete)

    for action_name in actions_to_delete:
        (enums.base.ACTIONS_CACHE / action_name).unlink()

    if not actions_to_update:
        return

    logger.debug(
        "Actions to fetch: %s %s...",
        str(len(actions_to_update)),
        str(actions_to_update)[:64],
    )
    queries = {"actions": ",".join(actions_to_update)}
    actions_request = client.http.get(url=str(client.actions.endpoint(queries)))
    if actions_request.status_code == 414:
        actions_request = client.http.get(url=str(client.actions.endpoint({})))

    actions_data = actions_request.json()
    for action_data in actions_data["items"]:
        create_action(
            response=action_data,
            storage_path=enums.base.ACTIONS_CACHE / action_data["name"],
        ).store()


@_handle_exceptions
def _check_and_refresh_triggers(client: Composio):
    local_triggers = set()
    if enums.base.TRIGGERS_CACHE.exists():
        local_triggers = set(
            map(lambda x: x.stem.upper(), enums.base.TRIGGERS_CACHE.iterdir())
        )

    api_triggers = set(client.triggers.list_enums())
    triggers_to_update = api_triggers - local_triggers
    triggers_to_delete = local_triggers - api_triggers
    if triggers_to_delete:
        logger.debug("Stale triggers: %s", triggers_to_delete)

    for trigger_name in triggers_to_delete:
        (enums.base.TRIGGERS_CACHE / trigger_name).unlink()

    if not triggers_to_update:
        return

    logger.debug("triggers to fetch: %s", triggers_to_update)
    queries = {"triggers": ",".join(triggers_to_update)}
    triggers_data = client.http.get(str(client.triggers.endpoint(queries))).json()
    for trigger_data in triggers_data:
        TriggerData(
            name=trigger_data["name"],
            app=trigger_data["appName"],
            path=enums.base.TRIGGERS_CACHE / trigger_data["name"],
        ).store()


@_handle_exceptions
def _check_and_refresh_apps(client: Composio):
    local_apps = set()
    if enums.base.APPS_CACHE.exists():
        local_apps = set(map(lambda x: x.stem.upper(), enums.base.APPS_CACHE.iterdir()))

    api_apps = set(client.apps.list_enums())
    apps_to_update = api_apps - local_apps
    apps_to_delete = local_apps - api_apps
    if apps_to_delete:
        logger.debug("Stale apps: %s", apps_to_delete)

    for app_name in apps_to_delete:
        (enums.base.APPS_CACHE / app_name).unlink()

    if not apps_to_update:
        return

    logger.debug("Apps to fetch: %s", apps_to_update)
    queries = {"apps": ",".join(apps_to_update)}
    apps_data = client.http.get(str(client.apps.endpoint(queries))).json()
    for app_data in apps_data["items"]:
        AppData(
            name=app_data["name"],
            path=enums.base.APPS_CACHE / app_data["name"],
            is_local=False,
        ).store()


def check_cache_refresh(client: Composio) -> None:
    """
    Check if the actions have a 'replaced_by' field and refresh the cache if not.
    This is a workaround to invalidate local caches from older Composio versionos
    that do not have the 'replaced_by' field.

    Before this version, checking if an action is deprecated or not depended on the
    SDK version, and didn't come from the API. We need to start storing the data
    from the API and invalidate the cache if the data is not already stored.
    """
    if NO_CACHE_REFRESH:
        return

    global _cache_checked
    if _cache_checked:
        return
    _cache_checked = True

    logger.debug("Checking cache...")
    start = time.monotonic()

    ap_thread = threading.Thread(target=_check_and_refresh_apps, args=(client,))
    ac_thread = threading.Thread(target=_check_and_refresh_actions, args=(client,))
    tr_thread = threading.Thread(target=_check_and_refresh_triggers, args=(client,))

    ac_thread.start()
    ap_thread.start()
    tr_thread.start()

    # Load in between threads
    registry = load_local_tools()

    ap_thread.join()
    ac_thread.join()
    tr_thread.join()

    _create_local_actions_cache(registry=registry)
    _create_local_apps_cache(registry=registry)
    logger.debug("Time taken to update cache: %.2f seconds", time.monotonic() - start)
