"""
Local storage helpers.
"""

import json
import typing as t
from pathlib import Path

import typing_extensions as tx
from pydantic import BaseModel


class LocalStorage(BaseModel):
    """
    Local storage object.

    Example:
    ```python
        from pathlib import Path

        class User(LocalStorage):
            '''User account object'''

            name: str

        user = User(name="John", path=Path("user.json"))
        print (user.name)
        user.store()

        user = User.load(Path("user.json"))
        print (user.name)
    ```

    Note:
        When derriving from the `LocalStorage` class, `path` needs to be
        defined as a class variable.
    """

    path: t.Optional[Path] = None

    def to_json(self) -> t.Dict:
        """Convert object to JSON dictionary."""
        return self.model_dump()

    @classmethod
    def from_json(cls, obj: t.Dict, path: t.Optional[Path] = None) -> tx.Self:
        """Load from json object."""
        return cls(**obj, path=path)

    def store(self) -> None:
        """Store object as a JSON file."""
        if self.path is None:
            raise ValueError(
                f"Value of `path` is not set for `{self.__class__.__name__}`"
            )

        data = self.to_json()
        if "path" in data:
            del data["path"]

        self.path.write_text(
            json.dumps(
                data,
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> tx.Self:
        """Load user account from cache."""
        return cls.from_json(
            obj=json.loads(
                path.read_text(
                    encoding="utf-8",
                )
            ),
            path=path,
        )


class ModelEnv(LocalStorage):
    model_env: str


# todo: change this to litellm model config
class AzureModelConfig(LocalStorage):
    """
    endpoint-url for azure llm
    """

    model_env: str
    azure_endpoint: t.Optional[str] = None
    api_key: t.Optional[str] = None


class OpenAiModelConfig(LocalStorage):
    """
    azure-keys for azure keys
    """

    model_env: str
    api_key: t.Optional[str] = None


class IssueConfig(LocalStorage):
    repo_name: t.Optional[str] = None
    repo_init_from: t.Optional[str] = None
    issue_id: t.Optional[str] = None
    base_commit_id: t.Optional[str] = None
    issue_desc: t.Optional[str] = None
