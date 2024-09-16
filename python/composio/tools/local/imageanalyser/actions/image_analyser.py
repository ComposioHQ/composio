import base64
import os
import typing as t
from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import requests
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


system_prompt = "You are an expert assistant that analyzes images and provides detailed descriptions to answer questions about them."


class ModelChoice(str, Enum):
    GPT4_VISION = "gpt-4o"
    GPT4_VISION_MINI = "gpt-4o-mini"
    CLAUDE_3_SONNET = "claude-3-sonnet-20240229"


class ImageAnalyserRequest(BaseModel):
    media_paths: List[str] = Field(
        ..., description="List of local file paths or URLs of the media to be analyzed"
    )
    prompt: str = Field(..., description="Prompt for guiding the analysis")


class ImageAnalyserResponse(BaseModel):
    analysis: Optional[str] = Field(
        None, description="The resulting analysis of the media"
    )
    error_message: Optional[str] = Field(
        None, description="Error message if analysis failed"
    )


class MediaAnalyzer(ABC):
    @abstractmethod
    def analyze(
        self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str
    ) -> str:
        pass


class OpenAIAnalyzer(MediaAnalyzer):
    def analyze(
        self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str
    ) -> str:
        try:
            from openai import OpenAI  # pylint: disable=import-outside-toplevel
            from openai.types.chat import (  # pylint: disable=import-outside-toplevel
                ChatCompletionMessageParam,
            )
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "The 'openai' package is required for OpenAI analysis. Please install it using 'pip install openai'."
            ) from e
        client = OpenAI(api_key=api_key)
        content = [{"type": "text", "text": prompt}]

        for media_path in media_paths:
            image_url = (
                media_path
                if media_path.startswith(("http://", "https://"))
                else self._encode_image(media_path)
            )
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": image_url, "detail": "high"},  # type: ignore
                }
            )

        messages: List[ChatCompletionMessageParam] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},  # type: ignore
        ]

        try:
            response = client.chat.completions.create(model=model, messages=messages)
            return response.choices[0].message.content or "No analysis provided"
        except Exception as e:
            return f"Error during OpenAI analysis: {str(e)}"

    def _encode_image(self, file_path: str) -> str:
        with open(file_path, "rb") as image_file:
            return f"data:image/jpeg;base64,{base64.b64encode(image_file.read()).decode('utf-8')}"


class ClaudeAnalyzer(MediaAnalyzer):
    def analyze(
        self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str
    ) -> str:
        try:
            import anthropic  # pylint: disable=import-outside-toplevel
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "The 'anthropic' package is required for Claude analysis. Please install it using 'pip install anthropic'."
            ) from e
        client = anthropic.Anthropic(api_key=api_key)

        content = []
        for i, media_path in enumerate(media_paths, start=1):
            content.extend(
                [
                    {"type": "text", "text": f"Image {i}:"},
                    self._prepare_image_content(media_path),
                ]
            )

        content.append({"type": "text", "text": prompt})

        try:
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": content}],
            )
            return message.content[0].text  # type: ignore
        except Exception as e:
            return f"Error during Claude analysis: {str(e)}"

    def _prepare_image_content(self, media_path: str) -> Dict[str, Any]:
        if media_path.startswith(("http://", "https://")):
            response = requests.get(media_path, timeout=40)
            image_data = base64.b64encode(response.content).decode("utf-8")
        else:
            with open(media_path, "rb") as image_file:
                image_data = base64.b64encode(image_file.read()).decode("utf-8")

        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": self._get_media_type(media_path),
                "data": image_data,
            },
        }

    def _get_media_type(self, file_path: str) -> str:
        file_extension = Path(file_path).suffix.lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        if file_extension in media_types:
            return media_types[file_extension]
        return f"Unsupported image format: {file_extension}"


class Analyse(LocalAction[ImageAnalyserRequest, ImageAnalyserResponse]):
    """Analyze local images using multimodal LLMs."""

    _tags = ["image"]

    @property
    def analyzers(self) -> t.Dict[ModelChoice, MediaAnalyzer]:
        return {
            ModelChoice.GPT4_VISION: OpenAIAnalyzer(),
            ModelChoice.GPT4_VISION_MINI: OpenAIAnalyzer(),
            ModelChoice.CLAUDE_3_SONNET: ClaudeAnalyzer(),
        }

    def execute(
        self, request: ImageAnalyserRequest, metadata: Dict
    ) -> ImageAnalyserResponse:
        """Execute image analysis."""
        validation_result = self._validate_request(request)
        if validation_result:
            return ImageAnalyserResponse(error_message=validation_result, analysis=None)

        media_model_choice = os.environ.get("MEDIA_MODEL_CHOICE", "gpt-4o")
        media_model_choice = ModelChoice(media_model_choice)
        api_key_result = self._get_api_key(media_model_choice, metadata)
        if not isinstance(api_key_result, str):
            return ImageAnalyserResponse(
                error_message="No API key found", analysis=None
            )

        analyzer = self.analyzers.get(media_model_choice)
        if not analyzer:
            return ImageAnalyserResponse(
                error_message=f"Unsupported model: {media_model_choice}",
                analysis=None,
            )

        analysis = analyzer.analyze(
            media_model_choice,
            request.media_paths,
            request.prompt,
            api_key_result,
        )
        return ImageAnalyserResponse(analysis=analysis, error_message=None)

    def _validate_request(self, request: ImageAnalyserRequest) -> Optional[str]:
        if not request.media_paths:
            return "Media paths cannot be None or empty"
        for media_path in request.media_paths:
            if not media_path.startswith(("http://", "https://")):
                path = Path(media_path)
                if not path.exists() or not path.is_file():
                    return f"Media file not found: {media_path}"
        return None

    def _get_api_key(
        self, model: ModelChoice, metadata: dict
    ) -> Union[str, Dict[str, str]]:
        if model in [ModelChoice.GPT4_VISION, ModelChoice.GPT4_VISION_MINI]:
            key = os.environ.get("OPENAI_API_KEY") or metadata.get("OPENAI_API_KEY")
            key_name = "OPENAI_API_KEY"

        elif model == ModelChoice.CLAUDE_3_SONNET:
            key = os.environ.get("ANTHROPIC_API_KEY") or metadata.get(
                "ANTHROPIC_API_KEY"
            )
            key_name = "ANTHROPIC_API_KEY"
        else:
            return {"error": f"Unsupported model: {model}"}
        if not key:
            return f"{key_name} not found for {model}"
        return key
