from httpcore import TimeoutException
import requests
from composio.sdk.exceptions import UserNotAuthenticatedException, BadErrorException, InternalServerErrorException, NotFoundException

class HttpClient(requests.Session):
    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url

    def get(self, url: str, **kwargs):
        response = super().get(f"{self.base_url}/{url}", **kwargs)
        self._handle_response_errors(response, absolute_url=f"{self.base_url}/{url}")
        return response

    def post(self, url: str, data=None, json=None, **kwargs):
        response = super().post(f"{self.base_url}/{url}", data=data, json=json, **kwargs)
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
            raise NotFoundException(f"The requested resource was not found at {absolute_url}.")
        elif response.status_code == 401:
            raise UserNotAuthenticatedException(f"You are not authorized to access the resource at {absolute_url}.")
        elif response.status_code == 500:
            raise InternalServerErrorException(f"Internal server error occurred on {absolute_url}.")
        elif response.status_code == 400:
            raise BadErrorException(f"Bad request error at {absolute_url}.")
        elif response.status_code == 408:
            raise TimeoutException(f"The request timed out at {absolute_url}.")
        response.raise_for_status()  # Raise for other status codes that are not successful
