from pydantic import BaseModel, Field

from composio import ComposioToolSet, action


class RequestClass(BaseModel):
    pass


class ResponseClass(BaseModel):
    pass

metadata_value = None
API_KEY_KEY = "api_key"
API_KEY_VALUE = "api_key_value"

@action(toolname="tool")
def action_metadata_injection(request: RequestClass, metadata: dict) -> ResponseClass:
    """
    Test metadata injection.
    """
    global metadata_value
    metadata_value = metadata[API_KEY_KEY]
    return ResponseClass()


def test_metadata_injection() -> None:
    toolset = ComposioToolSet(metadata={action_metadata_injection: {API_KEY_KEY: API_KEY_VALUE}})
    toolset.execute_action(
        action=action_metadata_injection,
        params={},
    )
    assert (metadata_value == API_KEY_VALUE)
