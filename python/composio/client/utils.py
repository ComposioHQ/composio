import typing as t

from composio.client import Composio, enums
from composio.client.collections import ActionModel, AppModel, TriggerModel
from composio.tools.base.abs import DEPRECATED_MARKER
from composio.tools.local import load_local_tools
from composio.utils import get_enum_key


EnumModels = t.Union[AppModel, ActionModel, TriggerModel]


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

            if (
                action.description is not None
                and DEPRECATED_MARKER in action.description
            ):
                _, newact = action.description.split(DEPRECATED_MARKER, maxsplit=1)
                replaced_by = deprecated[get_enum_key(name=action.name)] = (
                    action.appName.lower() + "_" + newact.replace(">>", "")
                ).upper()
            else:
                action_names.append(get_enum_key(name=action.name))
                replaced_by = None

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
    # _update_annotations(
    #     cls=enums.Tag,
    #     attributes=tag_names,
    # )


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