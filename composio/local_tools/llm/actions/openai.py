import openai
from pydantic import BaseModel, Field
from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
import typing as t

from composio.core.local import Action



class OpenAIChatRequest(BaseModel):
    message: str = Field(..., description="Message to send to OpenAI")
    image_path: t.Optional[str] = Field(description="Path to image to send to OpenAI")


class OpenAIChatResponse(BaseModel):
    text: str = Field(..., description="Text response from OpenAI")


class OpenAIChat(Action[OpenAIChatRequest, OpenAIChatResponse]):
    """
    Do an OpenAI call with text or image.
    """

    _display_name = "OpenAI Chat"
    _request_schema = OpenAIChatRequest
    _response_schema = OpenAIChatResponse
    _tags = ["llm"]
    _tool_name = "openai"

    def execute(
        self, request_data: OpenAIChatRequest, authorisation_data: dict
    ) -> dict:
        client = openai.OpenAI()
        messages = [ChatCompletionUserMessageParam(content=request_data.message, role="user")]
        if request_data.image_path:
            image_file = client.files.create(
                file=open(request_data.image_path, "rb"),
                purpose="vision",
            )
            messages.append(ChatCompletionUserMessageParam(content=f"data:image/jpeg;base64,{image_file.data.base64}", role="user"))
            


        response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[
                ChatCompletionUserMessageParam(content=request_data.message, role="user"),
            ],
        )
        return {"execution_details": {"executed": True}, "response_data": {"text": "Hello"}}