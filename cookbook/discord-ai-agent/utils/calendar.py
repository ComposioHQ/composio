from google.oauth2.credentials import Credentials
from gcsa.google_calendar import GoogleCalendar
import requests
import dotenv
import os


dotenv.load_dotenv()
COMPOSIO_API_KEY = os.environ["COMPOSIO_API_KEY"] # Get the API key from composio


def get_calendar_by_connectedAccountId(connectedAccountId: str) -> GoogleCalendar:
    """
        Get the calendar by connectedAccountId.

        :param required connectedAccountId: The ID of the connected account of the user.
    """

    url = f"https://backend.composio.dev/api/v1/connectedAccounts/{connectedAccountId}"

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.get(url, headers=headers)
    response_json = response.json()

    if not response.status_code == 200:
        print(response_json)
        return "Something went wrong. Please try again."

    token = Credentials(
        token=response_json['connectionParams']['access_token'],
        refresh_token=response_json['connectionParams']['refresh_token'],
        client_id=response_json['connectionParams']['client_id'],
        client_secret=response_json['connectionParams']['client_secret'],
        scopes=['https://www.googleapis.com/auth/calendar'],
        token_uri='https://oauth2.googleapis.com/token'
    )

    calendar = GoogleCalendar(credentials=token)

    return calendar