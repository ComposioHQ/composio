"""
Local storage helpers.
"""

import typing as t

from composio.storage.base import LocalStorage


class ModelEnv(LocalStorage):
    env: str


# todo: change this to litellm model config
class AzureModelConfig(LocalStorage):
    """
    endpoint-url for azure llm
    """

    env: str
    azure_endpoint: t.Optional[str] = None
    api_key: t.Optional[str] = None


class OpenAiModelConfig(LocalStorage):
    """
    azure-keys for azure keys
    """

    env: str
    api_key: t.Optional[str] = None


class IssueConfig(LocalStorage):
    repo_name: t.Optional[str] = None
    repo_init_from: t.Optional[str] = None
    issue_id: t.Optional[str] = None
    base_commit_id: t.Optional[str] = None
    issue_desc: t.Optional[str] = None
