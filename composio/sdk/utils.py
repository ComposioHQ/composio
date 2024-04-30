import os
import subprocess
from typing import Union

from pydantic import BaseModel

from .sdk import Composio
from .storage import get_base_account_api_key, get_base_url


def get_enum_key(name):
    characters_to_replace = [" ", "-", "/", "(", ")", "\\", ":", '"', "'", "."]
    for char in characters_to_replace:
        name = name.replace(char, "_")
    return name.upper()


def generate_enums_given_apps(apps, actions, triggers):
    enum_content = "from enum import Enum\n\n"
    enum_content += "class Tag(Enum):\n"
    enum_content += "    IMPORTANT = \"important\"\n\n"
    enum_content += "class App(Enum):\n"
    for app in apps["items"]:
        app_name = app["key"].upper().replace(" ", "_").replace("-", "_")
        enum_content += f'    {app_name} = "{app["key"]}"\n'

    enum_content += "\n"
    enum_content += "class Action(Enum):\n"
    enum_content += "    def __init__(self, service, action, no_auth):\n"
    enum_content += "        self.service = service\n"
    enum_content += "        self.action = action\n"
    enum_content += "        self.no_auth = no_auth\n\n"
    for app in apps["items"]:
        app_key = app["key"]
        app_no_auth = app.get("no_auth", False)
        app_actions = [action for action in actions if action["appKey"] == app_key]
        for action in app_actions:
            enum_name = f'{get_enum_key(action["name"])}'
            enum_value = f'("{app_key}", "{action["name"]}", {app_no_auth})'
            enum_content += f"    {enum_name} = {enum_value}\n"

    enum_content += "\n"
    enum_content += "class Trigger(Enum):\n"
    enum_content += "    def __init__(self, service, trigger):\n"
    enum_content += "        self.service = service\n"
    enum_content += "        self.trigger = trigger\n\n"
    for app in apps["items"]:
        app_key = app["key"]
        app_triggers = [trigger for trigger in triggers if trigger["appKey"] == app_key]
        for trigger in app_triggers:
            enum_name = f'{app_key.upper()}_{get_enum_key(trigger["display_name"])}'
            enum_value = f'("{app_key}", "{trigger["name"]}")'
            enum_content += f"    {enum_name} = {enum_value}\n"
        # enum_content += f'Actions.{app_name} = {app_name}\n\n'
    with open(
        os.path.join(os.path.dirname(__file__), "enums.py"), "w", encoding="utf-8"
    ) as f:
        f.write(enum_content)


def generate_enums():
    sdk_client = Composio(get_base_account_api_key())
    apps = sdk_client.get_list_of_apps()
    actions = sdk_client.get_list_of_actions()
    triggers = sdk_client.get_list_of_triggers()
    apps["items"] = [
        appitem
        for appitem in apps["items"]
        if not appitem["name"].lower().endswith("beta")
    ]
    actions = [
        action for action in actions if not action["appName"].lower().endswith("beta")
    ]
    generate_enums_given_apps(apps, actions, triggers)


def generate_enums_beta():
    sdk_client = Composio(get_base_account_api_key())
    apps = sdk_client.get_list_of_apps()
    actions = sdk_client.get_list_of_actions()
    triggers = sdk_client.get_list_of_triggers()
    generate_enums_given_apps(apps, actions, triggers)


class GitUserInfo(BaseModel):
    name: Union[None, str]
    email: Union[None, str]


def get_git_user_info() -> GitUserInfo:
    try:
        name = (
            subprocess.check_output(["git", "config", "user.name"])
            .strip()
            .decode("utf-8")
        )
        email = (
            subprocess.check_output(["git", "config", "user.email"])
            .strip()
            .decode("utf-8")
        )
        return GitUserInfo(name=name, email=email)
    except subprocess.CalledProcessError:
        return GitUserInfo(name=None, email=None)


def get_frontend_url(path: str) -> str:
    base_url = get_base_url()
    if base_url == "https://backend.composio.dev/api":
        return f"https://app.composio.dev/{path}"
    if base_url == "https://hermes-development.up.railway.app/api":
        return f"https://hermes-frontend-git-master-composio.vercel.app/{path}"
    if base_url == "http://localhost:9900/api":
        return f"http://localhost:3000/{path}"
    if base_url == "https://hermes-development.up.railway.app/":
        return f"https://hermes-frontend-git-master-composio.vercel.app/{path}"

    raise Exception(f"Incorrect format for base_url: {base_url}. Format should be https://backend.composio.dev/api or http://localhost:9900/api")
