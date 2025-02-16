import os
from google import genai
from composio_gemini import ComposioToolSet, App, Action
from dotenv import load_dotenv
from google.genai import types

load_dotenv()

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.HACKERNEWS_GET_LATEST_POSTS, Action.TWITTER_CREATION_OF_A_POST])

config = types.GenerateContentConfig(tools=tools) # type: ignore

client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

# Generate directly with generate_content.
response = client.models.generate_content(
    model='gemini-2.0-flash',
    config=config,
    contents=f"""
            "You are a Search Agent for Hackernews."
            "You are provided with today's date"
            "Find the most interesting hackernews post"
            "Once you have discovered that, post it on twitter with the link and one line description about it."
            "The structure should be One or Two line description about the post, then link to the post"
            "The output shouldnt use markdown, write normal text"
    """
)
print(response.text)



