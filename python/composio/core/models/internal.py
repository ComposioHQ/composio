from composio_client import BaseModel

from composio.core.models.base import Resource

INTERNAL_SDK_REALTIME_CREDENTIALS_ENDPOINT = "/api/v3/internal/sdk/realtime/credentials"


class SDKRealtimeCredentialsResponse(BaseModel):
    pusher_key: str
    project_id: str
    pusher_cluster: str


class Internal(Resource):
    """
    Internal resource for getting internal SDK realtime credentials.
    """

    def get_sdk_realtime_credentials(self) -> SDKRealtimeCredentialsResponse:
        """
        Get the SDK realtime credentials.

        :return: The SDK realtime credentials.
        """
        return self._client.get(
            path=INTERNAL_SDK_REALTIME_CREDENTIALS_ENDPOINT,
            cast_to=SDKRealtimeCredentialsResponse,
        )
