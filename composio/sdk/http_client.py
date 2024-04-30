from httpcore import TimeoutException
import requests
from composio.sdk.exceptions import UserNotAuthenticatedException, BadErrorException, InternalServerErrorException, NotFoundException

class HttpClient(requests.Session):
    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url

    def get(self, url: str, **kwargs):
        print(f"GET {self.base_url}/{url}")
        response = super().get(f"{self.base_url}/{url}", **kwargs)
        self._handle_response_errors(response)
        return response

    def post(self, url: str, data=None, json=None, **kwargs):
        print(f"POST {self.base_url}/{url}")
        response = super().post(f"{self.base_url}/{url}", data=data, json=json, **kwargs)
        self._handle_response_errors(response)
        return response

    def put(self, url: str, data=None, **kwargs):
        print(f"PUT {self.base_url}/{url}")
        response = super().put(f"{self.base_url}/{url}", data=data, **kwargs)
        self._handle_response_errors(response)
        return response

    def delete(self, url: str, **kwargs):
        print(f"DELETE {self.base_url}/{url}")
        response = super().delete(f"{self.base_url}/{url}", **kwargs)
        self._handle_response_errors(response)
        return response

    def _handle_response_errors(self, response):
        if response.status_code == 404:
            raise NotFoundException("The requested resource was not found.")
        elif response.status_code == 401:
            raise UserNotAuthenticatedException("You are not authorized to access this resource.")
        elif response.status_code == 500:
            raise InternalServerErrorException("Internal server error occurred.")
        elif response.status_code == 400:
            raise BadErrorException("Bad request error.")
        elif response.status_code == 408:
            raise TimeoutException("The request timed out.")
        response.raise_for_status()  # Raise for other status codes that are not successful
