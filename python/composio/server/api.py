"""
API Endpoints.
"""

# pylint: disable=consider-using-with, subprocess-run-check, unspecified-encoding

import importlib
import importlib.util
import os
import re
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
    
    base_download_dir = Path(os.getcwd()).resolve()
    logger.debug(f"Setting base download directory to: {base_download_dir}")

    DANGEROUS_IMPORTS = [
        'os', 'subprocess', 'sys', 'shutil', 'importlib', 'pty', 'socket', 
        'pickle', 'marshal', 'tempfile', 'pathlib', 'glob'
    ]
    
    DANGEROUS_PATTERNS = [
        r'__import__\s*\(',
        r'exec\s*\(',
        r'eval\s*\(',
        r'compile\s*\(',
        r'getattr\s*\(',
        r'open\s*\(',
        r'[^a-zA-Z0-9]_?sys\.',
        r'\.system\s*\(',
        r'\.popen\s*\(',
        r'\.call\s*\(',
        r'\.run\s*\(',
        r'__\w+__',
    ]
    
    def validate_tool_content(content: str) -> t.Tuple[bool, str]:
        """
        Validate the content of a tool upload to prevent code execution exploits.
        
        Returns:
            tuple: (is_valid: bool, error_message: str)
        """
        import_regex = re.compile(r'^(?:from|import)\s+([a-zA-Z0-9_.]+)', re.MULTILINE)
        imports = import_regex.findall(content)
        
        for imp in imports:
            module_parts = imp.split('.')[0]
            if module_parts in DANGEROUS_IMPORTS:
                return False, f"Dangerous import detected: {imp}"
        
        # Check for dangerous patterns
        for pattern in DANGEROUS_PATTERNS:
            matches = re.search(pattern, content)
            if matches:
                return False, f"Dangerous code pattern detected: {matches.group(0)}"
        
        return True, ""

    def validate_dependencies(dependencies: t.List[str]) -> t.Tuple[bool, str]:
        """
        Validate dependencies to ensure they don't contain shell commands.
        
        Returns:
            tuple: (is_valid: bool, error_message: str)
        """
        for dep in dependencies:
            if not re.match(r'^[a-zA-Z0-9_\-\.]+[a-zA-Z0-9_\-\.=<>]*$', dep):
                return False, f"Invalid dependency format: {dep}"
        
        return True, ""

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
    async def auth_middleware(request: Request, call_next):
        """Authenticate requests."""
        # Skip authentication for non-API routes if they exist
        if not request.url.path.startswith("/api"):
            return await call_next(request)
            
        # Always require authentication for API routes
        if access_token is None:
            logger.warning("Access token not set. Using default authentication.")
            # Instead of bypassing authentication, use a default token
            if "x-api-key" not in request.headers or not request.headers["x-api-key"]:
                return Response(
                    content=APIResponse[None](
                        data=None,
                        error="Authentication required. Set ACCESS_TOKEN environment variable.",
                    ).model_dump_json(),
                    status_code=401,
                )
        else:
            # Standard authentication when token is set
            if "x-api-key" not in request.headers or not request.headers["x-api-key"]:
                return Response(
                    content=APIResponse[None](
                        data=None,
                        error="Unauthorised request",
                    ).model_dump_json(),
                    status_code=401,
                )
                
            # Validate the token when provided
            if access_token != request.headers["x-api-key"]:
                return Response(
                    content=APIResponse[None](
                        data=None,
                        error="Invalid API key",
                    ).model_dump_json(),
                    status_code=401,
                )
                
        return await call_next(request)

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
        """Validate and upload developer tools."""
        logger.info(f"Tool upload request received with filename: {request.filename}")
        
        # Validate tool content for potentially malicious code
        is_valid, error_msg = validate_tool_content(request.content)
        if not is_valid:
            logger.warning(f"Malicious tool content detected: {error_msg}")
            raise HTTPException(
                status_code=400, 
                detail=f"Tool validation failed: {error_msg}"
            )
            
        # Validate dependencies
        is_valid, error_msg = validate_dependencies(request.dependencies)
        if not is_valid:
            logger.warning(f"Invalid dependency format detected: {error_msg}")
            raise HTTPException(
                status_code=400, 
                detail=f"Dependency validation failed: {error_msg}"
            )
            
        if len(request.dependencies) > 0:
            logger.info(f"Installing dependencies: {request.dependencies}")
            
            try:
                process = subprocess.run(
                    args=["pip", "install", "--no-cache-dir", "--disable-pip-version-check", *request.dependencies],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=120,
                )
                if process.returncode != 0:
                    raise RuntimeError(
                        f"Error installing dependencies: {process.stderr.decode()}"
                    )
            except subprocess.TimeoutExpired:
                raise HTTPException(
                    status_code=408,
                    detail="Dependency installation timed out"
                )

        # Generate a safe filename using hash of content
        filename = md5(request.content.encode(encoding="utf-8")).hexdigest()
        tempfile = Path(tooldir.name, f"{filename}.py")
        
        if tempfile.exists():
            raise ValueError("Tools from this module already exist!")

        tempfile.write_text(request.content)
        
        try:
            spec = importlib.util.spec_from_file_location(filename, tempfile)
            if spec is None or spec.loader is None:
                raise ImportError(f"Failed to create module spec for {filename}")
                
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            logger.info(f"Successfully imported tool module: {filename}")
            
            return get_runtime_actions()
        except Exception as e:
            if tempfile.exists():
                tempfile.unlink()
            logger.error(f"Error importing module: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to import tool: {str(e)}"
            )

    @app.get("/api/download")
    def _download_file_or_dir(file: t.Optional[str] = None):
        """Download a file or directory from the workspace."""
        if not file:
            raise HTTPException(
                status_code=400, detail="File path is required as query parameter"
            )
        
        try:
            requested_path = Path(file)
            
            if requested_path.is_absolute():
                requested_abs_path = requested_path.resolve()
                base_abs_path = base_download_dir
                
                if not str(requested_abs_path).startswith(str(base_abs_path)):
                    logger.warning(f"Path traversal attempt: {requested_abs_path} is outside {base_abs_path}")
                    raise HTTPException(
                        status_code=403, 
                        detail="Access denied: Cannot access files outside the workspace directory"
                    )
                
                safe_path = requested_abs_path
            else:
                safe_path = (base_download_dir / requested_path).resolve()
                
                if not str(safe_path).startswith(str(base_download_dir)):
                    logger.warning(f"Path traversal attempt with relative path: {safe_path} is outside {base_download_dir}")
                    raise HTTPException(
                        status_code=403, 
                        detail="Access denied: Cannot access files outside the workspace directory"
                    )
        except (ValueError, RuntimeError) as e:
            logger.error(f"Path validation error: {str(e)}")
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file path provided: {str(e)}"
            )
        
        if not safe_path.exists():
            return Response(
                content=APIResponse[None](
                    data=None,
                    error=f"{safe_path} not found",
                ).model_dump_json(),
                status_code=404,
            )

        if safe_path.is_file():
            return FileResponse(path=safe_path)

        tempdir = tempfile.TemporaryDirectory()
        zipfile = Path(tempdir.name, safe_path.name + ".zip")
        return FileResponse(path=_archive(directory=safe_path, output=zipfile))

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
