import typing as t
from json import JSONDecodeError

import requests
from pydantic import BaseModel

from composio.tools.local.base import Action


class OpenAPIAction(Action):
    """Action abstraction for tools generated using OpenAPI specs."""

    url: str
    path: str
    method: str
    operation_id: str
    action_identifier: str

    path_params: t.Dict[str, str]
    query_params: t.Dict[str, str]
    header_params: t.Dict[str, str]
    request_params: t.Dict[str, t.Any]

    aliases: t.Dict[str, str]

    content_type: t.Optional[str] = None
    extra_headers: t.Optional[t.Dict[str, str]] = None

    _tool_name = "clickup_local"

    def _get_query_params(self, request: t.Dict, auth: t.Dict) -> t.Dict:
        """Get query params."""
        params = {}
        for param, alias in self.query_params.items():
            if param in request:
                params[alias] = request[param]
        params.update(auth.get("query_params", {}))
        return params

    def _get_path_params(self, request: t.Dict) -> t.Dict:
        """Get query params."""
        params = {}
        for param, alias in self.path_params.items():
            if param not in request:
                raise ValueError(f"Missing required param: {param}")
            params[alias] = request[param]
        return params

    def _get_header_params(self, request: t.Dict, auth: t.Dict) -> t.Dict:
        """Get query params."""
        params = self.extra_headers or {}
        for param in self.header_params:
            if param in request:
                params[param] = request[param]
        params.update(auth.get("headers", {}))
        params["Content-Type"] = (
            self.content_type if self.content_type is not None else "application/json"
        )
        return params

    def _get_aliased_params(
        self, param: str, schema: t.Dict, request: t.Dict
    ) -> t.Optional[t.Dict]:
        """Get aliased params."""
        if param not in self.aliases:
            return None

        data = {}
        alias = self.aliases[param]
        for _param, _schema in schema.items():
            _alias = _schema.pop("__alias", _param)
            if len(_schema) == 0:
                value = request.get(
                    f"{_param}_{alias}", request.get(f"{param}__{_param}")
                )
                if value is None:
                    continue
                data[_alias] = value
                continue
            data[_alias] = self._get_aliased_params(
                param=f"{param}__{_param}", schema=_schema, request=request
            )
        return data

    def _get_request_params(self, request: t.Dict) -> t.Dict:
        """Get request params."""
        params = {}
        for param, schema in self.request_params.items():
            alias = schema.pop("__alias", param)
            if len(schema) == 0 and param in request:
                params[alias] = request[param]
                continue
            value = self._get_aliased_params(
                param=param, schema=schema, request=request
            )
            if value is not None:
                params[alias] = value
        return params

    def _get_url(self) -> str:
        """Get request URL."""
        return (
            self.url[:-1] + self.path
            if self.url.endswith("/")
            else self.url + self.path
        )

    def execute(self, request: BaseModel, authorisation_data: dict) -> t.Dict:
        """Execute API request using the defined schema params."""
        token = authorisation_data.get("token")
        if token is None:
            raise RuntimeError("`token` is required for running clickup actions")

        _request = request.model_dump(
            exclude_none=True,
            by_alias=True,
        )
        response = requests.request(
            method=self.method,
            url=self._get_url().format(
                **self._get_path_params(
                    request=_request,
                )
            ),
            params=self._get_query_params(
                request=_request,
                auth=authorisation_data,
            ),
            headers={
                "Authorization": f"Bearer {token}",
                **self._get_header_params(
                    request=_request,
                    auth=authorisation_data,
                ),
            },
            json=(
                self._get_request_params(
                    request=_request,
                )
                if self.method != "get"
                else None
            ),
            timeout=300.0,
        )
        # TODO: Handle status codes as per OpenAPI spec
        if response.status_code >= 200 and response.status_code < 300:
            try:
                return {
                    "execution_details": {"executed": True},
                    "response_data": response.json(),
                }
            except JSONDecodeError:
                return {
                    "execution_details": {"executed": True},
                    "response_data": response.text,
                }

        return {
            "execution_details": {"executed": False},
            "response_data": {
                "error": response.text,
                "status_code": response.status_code,
            },
        }
