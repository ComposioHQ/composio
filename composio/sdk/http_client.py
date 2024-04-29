import requests

class HttpClient:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def get(self, url: str):
        response = requests.get(f"{self.base_url}/{url}")
        self._handle_response_errors(response)
        return response

    def post(self, url: str, data: dict):
        response = requests.post(f"{self.base_url}/{url}", json=data)
        self._handle_response_errors(response)
        return response

    def put(self, url: str, data: dict):
        response = requests.put(f"{self.base_url}/{url}", json=data)
        self._handle_response_errors(response)
        return response

    def delete(self, url: str):
        response = requests.delete(f"{self.base_url}/{url}")
        self._handle_response_errors(response)
        return response

    def _handle_response_errors(self, response):
        if response.status_code == 404:
            raise NotFoundException("The requested resource was not found.")
        elif response.status_code == 401:
            raise UnauthorizedAccessException("You are not authorized to access this resource.")
        elif response.status_code == 500:
            raise InternalServerErrorException("Internal server error occurred.")
        elif response.status_code == 400:
            raise BadErrorException("Bad request error.")
        elif response.status_code == 408:
            raise TimeoutException("The request timed out.")
        response.raise_for_status()  # Raise for other status codes that are not successful
