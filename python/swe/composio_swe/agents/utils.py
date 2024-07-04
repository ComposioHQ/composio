"""
Agent runtime utilities.
"""

import os
import typing as t

from langchain_anthropic import ChatAnthropic
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from llama_index.core.llms.function_calling import FunctionCallingLLM
from llama_index.llms.anthropic import Anthropic
from llama_index.llms.openai import OpenAI


def get_langchain_llm() -> t.Union[ChatOpenAI, AzureChatOpenAI, ChatAnthropic]:
    helicone_api_key = os.environ.get("HELICONE_API_KEY")
    if os.environ.get("ANTHROPIC_API_KEY"):
        if helicone_api_key:
            return ChatAnthropic(
                model_name="claude-3-5-sonnet-20240620",
                anthropic_api_url="https://anthropic.helicone.ai/",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )  # type: ignore
        return ChatAnthropic(model_name="claude-3-5-sonnet-20240620")  # type: ignore
    if os.environ.get("OPENAI_API_KEY"):
        if helicone_api_key:
            return ChatOpenAI(
                model="gpt-4-turbo",
                base_url="https://oai.helicone.ai/v1",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )
        return ChatOpenAI(model="gpt-4-turbo")
    if os.environ.get("AZURE_OPENAI_API_KEY"):
        return AzureChatOpenAI(model="test")

    raise RuntimeError(
        "Could not find API key for any supported LLM models, "
        "please export either `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` "
        "or `AZURE_OPENAI_API_KEY`"
    )


def get_llama_llm() -> FunctionCallingLLM:
    """
    This Python function is named `get_llama_llm` and it returns an object of type `FunctionCallingLLM`.
    """
    helicone_api_key = os.environ.get("HELICONE_API_KEY")
    if os.environ.get("ANTHROPIC_API_KEY"):
        if helicone_api_key:
            return Anthropic(
                model="claude-3-5-sonnet-20240620",
                base_url="https://anthropic.helicone.ai/",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )  # type: ignore
        return Anthropic(model="claude-3-5-sonnet-20240620")  # type: ignore
    if os.environ.get("OPENAI_API_KEY"):
        if helicone_api_key:
            return OpenAI(
                model="gpt-4-turbo",
                api_base="https://oai.helicone.ai/v1",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )
        return OpenAI(model="gpt-4-turbo")
    raise RuntimeError(
        "Could not find API key for any supported LLM models, "
        "please export either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` "
    )
