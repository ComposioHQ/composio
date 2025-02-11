"""Tool abstractions."""

import base64
import os
import traceback
import typing as t
from abc import abstractmethod
from pathlib import Path

from pydantic import BaseModel, Field

from composio.exceptions import NotFoundError
from composio.tools.base.abs import (
    Action,
    ActionRequest,
    ActionResponse,
    InvalidClassDefinition,
    Tool,
    ToolBuilder,
)
from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.env.host.workspace import Browsers, FileManagers, Shells


class FileModel(BaseModel):
    name: str = Field(
        ...,
        description="File name, contains extension to indetify the file type",
    )
    content: bytes = Field(
        ...,
        description="File content in base64",
    )


class LocalAction(  # pylint: disable=abstract-method
    Action[ActionRequest, ActionResponse],
    abs=True,
):
    """Local action abstraction."""

    _shells: t.Callable[[], Shells]
    _browsers: t.Callable[[], Browsers]
    _filemanagers: t.Callable[[], FileManagers]

    @property
    def shells(self) -> Shells:
        return self._shells()

    @property
    def browsers(self) -> Browsers:
        return self._browsers()

    @property
    def filemanagers(self) -> FileManagers:
        return self._filemanagers()


class LocalToolMeta(type):
    """Tool metaclass."""

    def __init__(  # pylint: disable=self-cls-assignment,unused-argument
        cls,
        name: str,
        bases: t.Tuple,
        dict_: t.Dict,
        autoload: bool = False,
    ) -> None:
        """Initialize action class."""
        if name == "LocalTool":
            return

        ToolBuilder.validate(
            obj=cls,  # type: ignore
            name=name,
            methods=("actions",),
        )
        ToolBuilder.set_metadata(
            obj=cls,  # type: ignore
        )
        ToolBuilder.setup_children(
            obj=cls,  # type: ignore
            no_auth=True,
        )

        if autoload:
            t.cast(t.Type["Tool"], cls).register()  # type: ignore

        if not hasattr(cls, "logo"):
            raise InvalidClassDefinition(f"Please provide logo URL for {name}")

        if "local" not in cls.tags:  # type: ignore
            cls.tags.append("local")  # type: ignore


class LocalToolMixin(Tool):
    @classmethod
    @abstractmethod
    def actions(cls) -> t.List[t.Type[t.Any]]:
        """Get collection of actions for the tool."""

    @classmethod
    def _check_file_uploadable(cls, param: str, model: BaseModel) -> bool:
        return (
            model.model_json_schema()
            .get("properties", {})
            .get(param, {})
            .get("allOf", [{}])[0]
            .get("properties", {})
            or model.model_json_schema()
            .get("properties", {})
            .get(param, {})
            .get("properties", {})
        ) == FileModel.model_json_schema().get("properties")

    @classmethod
    def _process_request(cls, request: t.Dict, model: BaseModel) -> t.Dict:
        """Pre-process request for execution."""
        modified_request_data: t.Dict[str, t.Union[str, t.Dict[str, str]]] = {}
        for param, value in request.items():
            annotations = t.cast(t.Dict, model.model_fields[param].json_schema_extra)
            file_readable = (annotations or {}).get("file_readable", False)
            if file_readable and isinstance(value, str) and os.path.isfile(value):
                _content = Path(value).read_bytes()
                try:
                    _decoded = _content.decode("utf-8")
                except UnicodeDecodeError:
                    _decoded = base64.b64encode(_content).decode("utf-8")
                modified_request_data[param] = _decoded
                continue

            if (
                cls._check_file_uploadable(param=param, model=model)
                and isinstance(value, str)
                and os.path.isfile(value)
            ):
                _content = Path(value).read_bytes()
                modified_request_data[param] = {
                    "name": os.path.basename(value),
                    "content": base64.b64encode(_content).decode("utf-8"),
                }
                continue
            modified_request_data[param] = value
        return modified_request_data

    def execute(
        self,
        action: str,
        params: t.Dict,
        metadata: t.Optional[t.Dict] = None,
    ) -> t.Dict:
        """
        Execute the given action

        :param name: Name of the action.
        :param params: Execution parameters.
        :param metadata: A dictionary containing metadata for action.
        """
        actcls = self._actions.get(action)
        if actcls is None:
            raise NotFoundError(f"No action found with name `{action}`")

        try:
            metadata = metadata or {}
            instance = actcls(**metadata.get("kwargs", {}))
            if isinstance(instance, LocalAction):
                setattr(instance, "_shells", metadata["_shells"])
                setattr(instance, "_browsers", metadata["_browsers"])
                setattr(instance, "_filemanagers", metadata["_filemanagers"])

            response = instance.execute(
                request=actcls.request.parse(  # type: ignore
                    request=self._process_request(
                        request=params,
                        model=actcls.request.model,  # type: ignore
                    )
                ),
                metadata=metadata,
            )
            return {
                "data": response.model_dump(),
                "error": None,
                "successful": True,
            }
        except ExecutionFailed as e:
            self.logger.error(f"Error executing `{action}`: {e}")
            return {
                "data": None,
                "error": e.message,
                "successful": False,
                **e.extra,
            }
        except Exception as e:
            self.logger.error(f"Error executing `{action}`: {e}")
            self.logger.error(traceback.format_exc())
            return {
                "data": None,
                "error": str(e),
                "successful": False,
            }


class LocalTool(LocalToolMixin, metaclass=LocalToolMeta):
    """Local tool class."""

    gid = "local"
    """Group ID for this tool."""

    tags: t.List[str] = ["local"]
    """Tags for this app."""

    @classmethod
    @abstractmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Get collection of actions for the tool."""
