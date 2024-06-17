import typing as t

from composio.storage import LocalStorage

class ModelEnvConfig(LocalStorage):
    model_env: t.Optional[str] = None

#todo: change this to litellm model config
class AzureModelConfig(ModelEnvConfig):
    '''
    endpoint-url for azure llm  
    '''
    azure_endpoint: t.Optional[str] = None

    '''
    azure-keys for azure keys
    '''
    api_key: t.Optional[str] = None


class OpenAiModelConfig(ModelEnvConfig):
    '''
    azure-keys for azure keys
    '''
    api_key: t.Optional[str] = None


class IssueConfig(LocalStorage):
    repo_name: t.Optional[str] = None,
    repo_init_from: t.Optional[str] = None
    issue_id: t.Optional[str] = None
    base_commit_id: t.Optional[str] = None
    issue_desc: t.Optional[str] = None
