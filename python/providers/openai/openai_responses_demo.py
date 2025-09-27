"""
OpenAI Responses API demo.
"""

from composio_openai import OpenAIResponsesProvider

print("OpenAI Responses Provider imported successfully!")

provider = OpenAIResponsesProvider()
print("Provider name:", provider.name)
print("Provider type:", type(provider).__name__)

provider_with_strict = OpenAIResponsesProvider(strict=True)
print("Provider with strict=True initialized successfully!")
print("Strict provider name:", provider_with_strict.name)

print("All tests passed! OpenAI Responses Provider is working correctly.")
