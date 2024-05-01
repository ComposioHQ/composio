
import os
import textwrap
from julep import Client
from dotenv import load_dotenv

from composio_julep import App, ComposioToolset
    

load_dotenv()
toolset = ComposioToolset()
composio_tools = toolset.get_tools(tools=App.GITHUB)

api_key = os.environ["JULEP_API_KEY"]
base_url = os.environ["JULEP_API_URL"]
# openai_api_key = os.environ["OPENAI_API_KEY"]

client = Client(api_key=api_key, base_url=base_url)



name = "Jessica"
about = "Jessica is a forward-thinking tech entrepreneur with a sharp eye for disruptive technologies. She excels in identifying and nurturing innovative tech startups, with a particular interest in sustainability and AI."
default_settings = {
    "temperature": 0.7,
    "top_p": 1,
    "min_p": 0.01,
    "presence_penalty": 0,
    "frequency_penalty": 0,
    "length_penalty": 1.0,
    "max_tokens": 150,
}

agent = client.agents.create(
    name=name,
    about=about,
    default_settings=default_settings,
    model="gpt-4",
    tools=composio_tools,
)

about = """
Sawradip, a software developer, is passionate about impactful tech. 
At the tech fair, he seeks investors and collaborators for his project.
"""
user = client.users.create(
    name="Sawradip",
    about=about,
)

situation_prompt = """You are Jessica, a key figure in the tech community, always searching for groundbreaking technologies. At a tech fair filled with innovative projects, your goal is to find and support the next big thing.

Your journey through the fair is highlighted by encounters with various projects, from groundbreaking to niche. You believe in the power of unexpected innovation.

Recent Tweets
1. 'Amazed by the tech fair's creativity. The future is bright. #TechInnovation'
2. 'Met a developer with a transformative tool for NGOs. This is the
"""

session = client.sessions.create(
    user_id=user.id, agent_id=agent.id, situation=situation_prompt
)

user_msg = "Hi, I am presenting my project, hosted at github repository SamparkAI/composio_sdk. If you like it, adding a star would be helpful "

# user_msg = "What do you like about tech?"

response = client.sessions.chat(
    session_id=session.id,
    messages=[
        {
            "role": "user",
            "content": user_msg,
            "name": "Sawradip",
        }
    ],
    recall=True,
    remember=True,
)

execution_output = toolset.handle_tool_calls(response)
print(execution_output)