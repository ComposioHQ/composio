"""
API Endpoints.
"""

# pylint: disable=consider-using-with, subprocess-run-check, unspecified-encoding

import importlib
import os
import subprocess
import sys
import tempfile
import traceback
import typing as t
import zipfile
from functools import update_wrapper
from hashlib import md5
from pathlib import Path

import typing_extensions as te
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from composio import Action, App, __version__
from composio.cli.context import get_context
from composio.client.collections import ActionModel, AppModel
from composio.client.enums.base import get_runtime_actions
from composio.tools.base.abs import action_registry
from composio.tools.env.base import ENV_ACCESS_TOKEN
from composio.tools.local import load_local_tools
from composio.utils.logging import get as get_logger


ResponseType = t.TypeVar("ResponseType")

R = t.TypeVar("R")
T = t.TypeVar("T")
P = te.ParamSpec("P")
F = t.TypeVar("F")


class APIResponse(BaseModel, t.Generic[ResponseType]):
    """API Response."""

    data: t.Optional[ResponseType]
    error: t.Optional[str] = None
    traceback: t.Optional[str] = None


class GetApiResponse(BaseModel):
    """Response for GET /api."""

    version: str = Field(
        ...,
        description="Current API version.",
    )


class ToolUploadRequest(BaseModel):
    """Tool upload request."""

    content: str = Field(
        ...,
        description="Content from the tool description file.",
    )
    filename: str = Field(
        ...,
        description="Name of the file.",
    )
    dependencies: t.List[str] = Field(
        ...,
        description="List of dependencies.",
    )


class ExecuteActionRequest(BaseModel):
    """Execute action request."""

    params: t.Dict = Field(
        ...,
        description="Parameters for executing the request.",
    )
    metadata: t.Optional[t.Dict] = Field(
        None,
        description="Metadata for executing action.",
    )
    entity_id: t.Optional[str] = Field(
        None,
        description="Entity ID associated with the account.",
    )
    connected_account_id: t.Optional[str] = Field(
        None,
        description="Connection ID to use for executing the action.",
    )


class ValidateToolsRequest(BaseModel):
    apps: t.Optional[t.List[str]] = Field(
        None,
        description="Apps list.",
    )
    actions: t.Optional[t.List[str]] = Field(
        None,
        description="Actions list.",
    )
    tags: t.Optional[t.List[str]] = Field(
        None,
        description="Tags list.",
    )


def create_app() -> FastAPI:
    """Create Fast API app."""
    load_local_tools()

    access_token = os.environ.get(ENV_ACCESS_TOKEN)
    tooldir = tempfile.TemporaryDirectory()
    app = FastAPI(on_shutdown=[tooldir.cleanup])
    sys.path.append(tooldir.name)
    logger = get_logger()

    def with_exception_handling(f: t.Callable[P, R]) -> t.Callable[P, APIResponse[R]]:
        """Marks a callback as wanting to receive the current context object as first argument."""

        def wrapper(*args: P.args, **kwargs: P.kwargs) -> APIResponse[R]:
            try:
                return APIResponse[R](data=f(*args, **kwargs))
            except Exception as e:
                logger.error(traceback.format_exc())
                return APIResponse[R](
                    data=None,
                    error=str(e),
                    traceback=traceback.format_exc(),
                )

        return update_wrapper(wrapper, f)

    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        if access_token is None:
            return await call_next(request)

        if "x-api-key" in request.headers and request.headers["x-api-key"]:
            return await call_next(request)

        return Response(
            content=APIResponse[None](
                data=None,
                error="Unauthorised request",
            ).model_dump_json(),
            status_code=401,
        )

    @app.get("/api", response_model=APIResponse[GetApiResponse])
    @with_exception_handling
    def _api() -> GetApiResponse:
        """Composio tooling server API root."""
        return GetApiResponse(version=__version__)

    @app.get("/api/apps", response_model=APIResponse[t.List[AppModel]])
    @with_exception_handling
    def _get_apps() -> t.List[AppModel]:
        """Get list of all available apps."""
        return get_context().client.apps.get()

    @app.post("/api/apps/update", response_model=APIResponse[bool])
    @with_exception_handling
    def _update_apps() -> bool:
        """Get list of all available apps."""
        from composio.client.utils import (  # pylint: disable=import-outside-toplevel
            update_actions,
            update_apps,
            update_triggers,
        )

        apps = update_apps(client=get_context().client)
        update_actions(client=get_context().client, apps=apps)
        update_triggers(client=get_context().client, apps=apps)
        return True

    @app.get("/api/apps/{name}", response_model=APIResponse[AppModel])
    @with_exception_handling
    def _get_apps_by_name(name: str) -> AppModel:
        """Get list of all available apps."""
        return get_context().client.apps.get(name=name)

    @app.get("/api/actions", response_model=APIResponse[t.List[ActionModel]])
    @with_exception_handling
    def _get_actions() -> t.List[ActionModel]:
        """Get list of all available actions."""
        return get_context().client.actions.get()

    @app.get("/api/actions/{name}", response_model=APIResponse[ActionModel])
    @with_exception_handling
    def _get_actions_by_name(name: str) -> ActionModel:
        """Get list of all available apps."""
        return get_context().client.actions.get(actions=[name])[0]

    @app.get("/api/local_actions", response_model=APIResponse[t.List[ActionModel]])
    @with_exception_handling
    def _get_local_actions() -> t.List[ActionModel]:
        """Get list of all available actions."""
        return get_context().toolset.get_action_schemas(
            actions=list(action_registry["local"])
        )

    @app.get("/api/enums/actions", response_model=APIResponse[t.List[str]])
    @with_exception_handling
    def _get_actions_enums() -> t.List[str]:
        """Get list of all available actions."""
        return [action.slug for action in Action.all()]

    @app.get("/api/enums/apps", response_model=APIResponse[t.List[str]])
    @with_exception_handling
    def _get_app_enums() -> t.List[str]:
        """Get list of all available actions."""
        return [app.slug for app in App.all()]

    @app.post("/api/actions/execute/{action}", response_model=APIResponse[t.Dict])
    @with_exception_handling
    def _execute_action(action: str, request: ExecuteActionRequest) -> t.Dict:
        """Execute an action."""
        return get_context().toolset.execute_action(
            action=action,
            params=request.params,
            metadata=request.metadata,
            entity_id=request.entity_id,
            connected_account_id=request.connected_account_id,
        )

    @app.post(path="/api/validate", response_model=APIResponse[t.Dict])
    @with_exception_handling
    def _validate_tools(request: ValidateToolsRequest) -> t.Dict:
        get_context().toolset.validate_tools(
            apps=request.apps,
            actions=request.actions,
            tags=request.tags,
        )
        return {"message": "validated"}

    @app.get("/api/workspace", response_model=APIResponse[t.Dict])
    @with_exception_handling
    def _get_workspace_information() -> t.Dict:
        """Get information on current workspace."""
        return {"type": get_context().toolset.workspace.__class__.__name__}

    @app.get("/api/tools", response_model=APIResponse[t.List[str]])
    @with_exception_handling
    def _get_workspace_tools() -> t.List[str]:
        """Get list of available developer tools."""
        return get_runtime_actions()

    @app.post("/api/tools", response_model=APIResponse[t.List[str]])
    @with_exception_handling
    def _upload_workspace_tools(request: ToolUploadRequest) -> t.List[str]:
        """Get list of available developer tools."""
        if len(request.dependencies) > 0:
            process = subprocess.run(
                args=["pip", "install", *request.dependencies],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if process.returncode != 0:
                raise RuntimeError(
                    f"Error installing dependencies: {process.stderr.decode()}"
                )

        filename = md5(request.content.encode(encoding="utf-8")).hexdigest()
        tempfile = Path(tooldir.name, f"{filename}.py")
        if tempfile.exists():
            raise ValueError("Tools from this module already exits!")

        tempfile.write_text(request.content)
        importlib.import_module(filename)
        return get_runtime_actions()

    @app.get("/api/download")
    def _download_file_or_dir(file: t.Optional[str] = None):
        """Get list of available developer tools."""
        if not file:
            raise HTTPException(
                status_code=400, detail="File path is required as query parameter"
            )
        path = Path(file)
        if not path.exists():
            return Response(
                content=APIResponse[None](
                    data=None,
                    error=f"{path} not found",
                ).model_dump_json(),
                status_code=404,
            )

        if path.is_file():
            return FileResponse(path=path)

        tempdir = tempfile.TemporaryDirectory()
        zipfile = Path(tempdir.name, path.name + ".zip")
        return FileResponse(path=_archive(directory=path, output=zipfile))

    return app


def _archive(directory: Path, output: Path) -> Path:
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as fp:
        for root, _, files in os.walk(directory):
            for file in files:
                fp.write(
                    os.path.join(root, file),
                    os.path.relpath(
                        os.path.join(root, file),
                        os.path.join(directory, ".."),
                    ),
                )
    return output
