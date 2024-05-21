import requests
from httpcore import TimeoutException

from composio.sdk.exceptions import (
    BadErrorException,
    InternalServerErrorException,
    NotFoundException,
    UserNotAuthenticatedException,
)


class HttpClient(requests.Session):
    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url

    def get(self, url: str, **kwargs):
        response = super().get(f"{self.base_url}/{url}", **kwargs)
        self._handle_response_errors(response, absolute_url=f"{self.base_url}/{url}")
        return response

    def post(self, url: str, data=None, json=None, **kwargs):
        response = super().post(
            f"{self.base_url}/{url}", data=data, json=json, **kwargs
        )
        self._handle_response_errors(response, absolute_url=f"{self.base_url}/{url}")
        return response

    def put(self, url: str, data=None, **kwargs):
        response = super().put(f"{self.base_url}/{url}", data=data, **kwargs)
        self._handle_response_errors(response, absolute_url=f"{self.base_url}/{url}")
        return response

    def delete(self, url: str, **kwargs):
        response = super().delete(f"{self.base_url}/{url}", **kwargs)
        self._handle_response_errors(response, absolute_url=f"{self.base_url}/{url}")
        return response

    def _handle_response_errors(self, response, absolute_url):
        if response.status_code == 404:
            raise NotFoundException(
                f"The requested resource was not found at {absolute_url}. response: {response.text}"
            )
        elif response.status_code == 401:
            raise UserNotAuthenticatedException(
                f"You are not authorized to access the resource at {absolute_url}. response: {response.text}"
            )
        elif response.status_code == 500:
            raise InternalServerErrorException(
                f"Internal server error occurred on {absolute_url}. response: {response.text}"
            )
        elif response.status_code == 400:
            raise BadErrorException(
                f"Bad request error at {absolute_url}. response: {response.text}"
            )
        elif response.status_code == 408:
            raise TimeoutException(
                f"The request timed out at {absolute_url}. response: {response.text}"
            )
        elif response.status_code >= 400:
            raise Exception(
                f"An error occurred at {absolute_url}. Status code: {response.status_code}, response: {response.text}"
            )
        response.raise_for_status()  # Raise for other status codes that are not successful


class HttpHandler:
    def __init__(self, base_url: str, api_key: str):
        self.http_client = HttpClient(base_url)
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": api_key}
        )

    def get_action_schemas(
        self, app_unique_ids: list[str] = [], use_case: str = "", limit: int = 0
    ):
        params = {}
        if use_case:
            params["use_case"] = use_case
            if limit:
                params["limit"] = limit
            if len(app_unique_ids) != 1:
                raise ValueError("Use case should be provided with exactly one app.")

        # Cannot apply limit without usecase
        elif limit != 0:
            raise ValueError("Limit can be only mentioned with Use case")

        if app_unique_ids:
            params["appNames"] = ",".join(app_unique_ids)

        resp = self.http_client.get("v1/actions", params=params)

        return resp.json()
