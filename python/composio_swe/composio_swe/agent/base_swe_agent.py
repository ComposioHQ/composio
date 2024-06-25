from abc import ABC, abstractmethod

from python.composio_swe.composio_swe.config.config_store import IssueConfig


class BaseSWEAgent(ABC):
    def __init__(self, *args, **kwargs):
        pass

    @abstractmethod
    def run(self, issue_config: IssueConfig):
        pass
