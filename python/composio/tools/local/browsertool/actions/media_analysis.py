from typing import Any, List, Dict, Optional
import os
import base64
from pathlib import Path
from enum import Enum
from abc import ABC, abstractmethod

import requests
from pydantic import BaseModel, Field
from composio.tools.local.base.action import Action

system_prompt = "You are an expert assistant that analyzes images and provides detailed descriptions to answer questions about them."

class ModelChoice(str, Enum):
    GPT4_VISION = "gpt-4o"
    GPT4_VISION_MINI = "gpt-4o-mini"
    CLAUDE_3_SONNET = "claude-3-sonnet-20240229"

class MediaAnalysisRequest(BaseModel):
    media_paths: List[str] = Field(..., description="List of local file paths or URLs of the media to be analyzed")
    model: ModelChoice = Field(default=ModelChoice.GPT4_VISION, description="Model to be used for analysis")
    prompt: str = Field(..., description="Prompt for guiding the analysis")

class MediaAnalysisResponse(BaseModel):
    analysis: Optional[str] = Field(None, description="The resulting analysis of the media")
    error_message: Optional[str] = Field(None, description="Error message if analysis failed")

class MediaAnalyzer(ABC):
    @abstractmethod
    def analyze(self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str) -> str:
        pass

class OpenAIAnalyzer(MediaAnalyzer):
    def analyze(self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str) -> str:
        try:
            from openai import OpenAI
            from openai.types.chat import ChatCompletionMessageParam
        except ImportError:
            raise ImportError("The 'openai' package is required for OpenAI analysis. Please install it using 'pip install openai'.")
        client = OpenAI(api_key=api_key)
        content = [{"type": "text", "text": prompt}]
        
        for media_path in media_paths:
            image_url = media_path if media_path.startswith(('http://', 'https://')) else self._encode_image(media_path)
            content.append({
                "type": "image_url",
                "image_url": {"url": image_url, "detail": "high"}, # type: ignore
            })

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
    def analyze(self, model: ModelChoice, media_paths: List[str], prompt: str, api_key: str) -> str:
        try:
            import anthropic
        except ImportError:
            raise ImportError("The 'anthropic' package is required for Claude analysis. Please install it using 'pip install anthropic'.")
        client = anthropic.Anthropic(api_key=api_key)
        
        content = []
        for i, media_path in enumerate(media_paths, start=1):
            content.extend([
                {"type": "text", "text": f"Image {i}:"},
                self._prepare_image_content(media_path)
            ])
        
        content.append({"type": "text", "text": prompt})
        
        try:
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": content}],
            )
            return message.content[0].text
        except Exception as e:
            return f"Error during Claude analysis: {str(e)}"

    def _prepare_image_content(self, media_path: str) -> Dict[str, Any]:
        if media_path.startswith(('http://', 'https://')):
            response = requests.get(media_path)
            image_data = base64.b64encode(response.content).decode('utf-8')
        else:
            with open(media_path, "rb") as image_file:
                image_data = base64.b64encode(image_file.read()).decode('utf-8')
        
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
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        if file_extension in media_types:
            return media_types[file_extension]
        return f"Unsupported image format: {file_extension}"

class MediaAnalysis(Action):
    """Analyze local media files using multimodal LLMs."""

    _display_name = "Analyze Local Media"
    _request_schema = MediaAnalysisRequest
    _response_schema = MediaAnalysisResponse
    _tags = ["multimodal"]
    _tool_name = "browsertool"

    def __init__(self):
        self.analyzers = {
            ModelChoice.GPT4_VISION: OpenAIAnalyzer(),
            ModelChoice.GPT4_VISION_MINI: OpenAIAnalyzer(),
            ModelChoice.CLAUDE_3_SONNET: ClaudeAnalyzer(),
        }

    def execute(
        self,
        request_data: MediaAnalysisRequest,
        authorisation_data: dict,
    ) -> MediaAnalysisResponse:
        """Execute media analysis on local files."""
        validation_result = self._validate_request(request_data)
        if validation_result:
            return MediaAnalysisResponse(error_message=validation_result, analysis=None)

        api_key_result = self._get_api_key(request_data.model, authorisation_data)
        if not isinstance(api_key_result, str):
            return MediaAnalysisResponse(error_message="No API key found", analysis=None)
        
        analyzer = self.analyzers.get(request_data.model)
        if not analyzer:
            return MediaAnalysisResponse(error_message=f"Unsupported model: {request_data.model}", analysis=None)

        analysis = analyzer.analyze(request_data.model, request_data.media_paths, request_data.prompt, api_key_result)
        return MediaAnalysisResponse(analysis=analysis, error_message=None)

    def _validate_request(self, request_data: MediaAnalysisRequest) -> Optional[str]:
        if not request_data.media_paths:
            return "Media paths cannot be None or empty"
        for media_path in request_data.media_paths:
            if not media_path.startswith(('http://', 'https://')):
                path = Path(media_path)
                if not path.exists() or not path.is_file():
                    return f"Media file not found: {media_path}"
        return None

    def _get_api_key(self, model: ModelChoice, authorisation_data: dict) -> str | Dict[str, str]:
        if model in [ModelChoice.GPT4_VISION, ModelChoice.GPT4_VISION_MINI]:
            key = os.environ.get("OPENAI_API_KEY") or authorisation_data.get("OPENAI_API_KEY")
            key_name = "OPENAI_API_KEY"

        elif model == ModelChoice.CLAUDE_3_SONNET:
            key = os.environ.get("ANTHROPIC_API_KEY") or authorisation_data.get("ANTHROPIC_API_KEY")
            key_name = "ANTHROPIC_API_KEY"
        else:
            return {"error": f"Unsupported model: {model}"}
        if not key:
            return f"{key_name} not found for {model}"
        return key