import json
import os
import time
import typing as t

from composio.client import Composio, enums
from composio.client.collections import ActionModel, AppModel, TriggerModel
from composio.client.enums.base import AppData, create_action, replacement_action_name
from composio.tools.local import load_local_tools
from composio.utils import get_enum_key
from composio.utils.logging import get_logger


EnumModels = t.Union[AppModel, ActionModel, TriggerModel]


logger = get_logger(__name__)

NO_CACHE_REFRESH = os.getenv("COMPOSIO_NO_CACHE_REFRESH", "false") == "true"


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


def update_apps(client: Composio, beta: bool = False) -> t.List[AppModel]:
    """Update apps."""
    apps = sorted(
        client.apps.get(),
        key=lambda x: x.key,
    )
    if not beta:
        apps = filter_non_beta_items(apps)

    _update_apps(apps=apps)
    return apps


def update_actions(
    client: Composio, apps: t.List[AppModel], beta: bool = False
) -> None:
    """Update actions and tags."""
    actions = sorted(
        client.actions.get(allow_all=True),
        key=lambda x: f"{x.appName}_{x.name}",
    )
    if not beta:
        actions = filter_non_beta_items(actions)

    _update_tags(apps=apps, actions=actions)
    _update_actions(apps=apps, actions=actions)


def update_triggers(
    client: Composio, apps: t.List[AppModel], beta: bool = False
) -> None:
    """Update triggers."""
    triggers = sorted(
        client.triggers.get(),
        key=lambda x: f"{x.appKey}_{x.name}",
    )
    if not beta:
        triggers = filter_non_beta_items(triggers)

    _update_triggers(apps=apps, triggers=triggers)


def _update_apps(apps: t.List[AppModel]) -> None:
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

    for tool in load_local_tools()["local"].values():
        if tool.enum in app_names:
            continue

        app_names.append(tool.enum)
        enums.base.AppData(
            name=tool.name,
            path=enums.base.APPS_CACHE / app_names[-1],
            is_local=True,
        ).store()


def _update_actions(apps: t.List[AppModel], actions: t.List[ActionModel]) -> None:
    """Get Action enum."""
    enums.base.ACTIONS_CACHE.mkdir(parents=True, exist_ok=True)
    deprecated = {}
    action_names = []
    for app in sorted(apps, key=lambda x: x.key):
        for action in actions:
            if action.appName != app.key:
                continue

            new_action_name = replacement_action_name(
                action.description or "", action.appName
            )
            if new_action_name is not None:
                replaced_by = deprecated[get_enum_key(name=action.name)] = (
                    new_action_name
                )
            else:
                action_names.append(get_enum_key(name=action.name))
                replaced_by = None

            # TODO: there is duplicate ActionData creation code in
            # `load_from_runtime` and `fetch_and_cache` in client/enums/action.py
            enums.base.ActionData(
                name=action.name,
                app=app.key,
                tags=action.tags,
                no_auth=app.no_auth,
                is_local=False,
                path=enums.base.ACTIONS_CACHE / get_enum_key(name=action.name),
                replaced_by=replaced_by,
            ).store()

    processed = []
    for tool in load_local_tools()["local"].values():
        if tool.name in processed:
            continue

        processed.append(tool.name)
        for actcls in tool.actions():
            action_names.append(actcls.enum)
            enums.base.ActionData(
                name=actcls.enum,
                app=tool.name,
                tags=actcls.tags(),
                no_auth=True,
                is_local=True,
                path=enums.base.ACTIONS_CACHE / action_names[-1],
                shell=False,
            ).store()


def _update_tags(apps: t.List[AppModel], actions: t.List[ActionModel]) -> None:
    """Create Tag enum class."""
    enums.base.TAGS_CACHE.mkdir(parents=True, exist_ok=True)
    tag_map: t.Dict[str, t.Set[str]] = {}
    for app in apps:
        app_name = app.key
        for action in [action for action in actions if action.appName == app_name]:
            if app_name not in tag_map:
                tag_map[app_name] = set()
            tag_map[app_name].update(action.tags or [])

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


def _update_triggers(
    apps: t.List[AppModel],
    triggers: t.List[TriggerModel],
) -> None:
    """Get Trigger enum."""
    trigger_names = []
    enums.base.TRIGGERS_CACHE.mkdir(exist_ok=True)
    for app in apps:
        for trigger in triggers:
            if trigger.appKey != app.key:
                continue

            trigger_names.append(get_enum_key(name=trigger.name).upper())
            enums.base.TriggerData(
                name=trigger.name,
                app=app.key,
                path=enums.base.TRIGGERS_CACHE / trigger_names[-1],
            ).store()


_cache_checked = False


def check_cache_refresh(client: Composio) -> None:
    """
    Check if the actions have a 'replaced_by' field and refresh the cache if not.
    This is a workaround to invalidate local caches from older Composio versionos
    that do not have the 'replaced_by' field.

    Before this version, checking if an action is deprecated or not depended on the
    SDK version, and didn't come from the API. We need to start storing the data
    from the API and invalidate the cache if the data is not already stored.
    """
    global _cache_checked
    if _cache_checked:
        return

    _cache_checked = True

    t0 = time.monotonic()
    if NO_CACHE_REFRESH:
        return

    local_actions = []
    if enums.base.ACTIONS_CACHE.exists():
        actions = list(enums.base.ACTIONS_CACHE.iterdir())
        for action in actions:
            action_data = json.loads(action.read_text())
            # The action file could be old. If it doesn't have a
            # replaced_by field, we want to overwrite it.
            if "replaced_by" not in action_data:
                action.unlink()
                continue

            local_actions.append(action.stem)

    api_actions = client.actions.list_enums()
    actions_to_update = set(api_actions) - set(local_actions)
    actions_to_delete = set(local_actions) - set(api_actions)
    logger.debug("Actions to fetch: %s", actions_to_update)
    logger.debug("Stale actions: %s", actions_to_delete)

    for action_name in actions_to_delete:
        (enums.base.ACTIONS_CACHE / action_name).unlink()

    if len(actions_to_update) > 50:
        # Major update, refresh everything
        apps = update_apps(client)
        update_actions(client, apps)
        update_triggers(client, apps)
        return

    local_apps = []
    if enums.base.ACTIONS_CACHE.exists():
        local_apps = list(path.stem for path in enums.base.APPS_CACHE.iterdir())

    api_apps = client.apps.list_enums()
    breakpoint()
    apps_to_update = set(api_apps) - set(local_apps)
    apps_to_delete = set(local_apps) - set(api_apps)
    logger.debug("Apps to fetch: %s", apps_to_update)
    logger.debug("Stale apps: %s", apps_to_delete)

    # for app_name in apps_to_delete:
    #     (enums.base.APPS_CACHE / app_name).unlink()

    # if apps_to_update:
    #     apps_data = client.http.get(
    #         str(client.apps.endpoint(queries={"apps": ",".join(apps_to_update)}))
    #     ).json()
    #     for app_data in apps_data["items"]:
    #         storage_path = enums.base.APPS_CACHE / app_data["name"]
    #         AppData(name=app_data["name"], path=storage_path, is_local=False).store()

    # if actions_to_update:
    #     actions_data = client.http.get(
    #         str(
    #             client.actions.endpoint(
    #                 queries={"actions": ",".join(actions_to_update)}
    #             )
    #         )
    #     ).json()
    #     for action_data in actions_data["items"]:
    #         storage_path = enums.base.ACTIONS_CACHE / action_data["name"]
    #         create_action(
    #             client, response=action_data, storage_path=storage_path
    #         ).store()

    logger.debug("Time taken to update cache: %.2f seconds", time.monotonic() - t0)
