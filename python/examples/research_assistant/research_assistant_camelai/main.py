import os
import dotenv
from colorama import Fore
from camel.agents import ChatAgent
from camel.configs import ChatGPTConfig
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType
from camel.utils import print_text_animated
from composio_camel import ComposioToolSet, App

# Load environment variables
dotenv.load_dotenv()

# Initialize the language model with OpenAI API key and model name
api_key = os.environ["OPENAI_API_KEY"]

# Setup tools using ComposioToolSet
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.SERPAPI])

# Configure the assistant model
assistant_model_config = ChatGPTConfig(
    temperature=0.0,
    tools=tools,
)

# Create the model
model = ModelFactory.create(
    model_platform=ModelPlatformType.OPENAI,
    model_type=ModelType.GPT_4O,
    model_config_dict={"api_key": api_key, **assistant_model_config.__dict__}
)

# Define the system message for the assistant
assistant_sys_msg = BaseMessage.make_assistant_message(
    role_name="Researcher",
    content=(
        "You are a researcher. Using the information in the task, you find out some of the most popular facts about the topic along with some of the trending aspects. "
        "You provide a lot of information thereby allowing a choice in the content selected for the final blog."
    ),
)

# Initialize the agent
agent = ChatAgent(
    assistant_sys_msg,
    model,
    tools=tools,
)

# Reset the agent to start fresh
agent.reset()

# Define the research task prompt
prompt = """
Research about open source LLMs vs closed source LLMs.
Your final answer MUST be a full analysis report.
"""

user_msg = BaseMessage.make_user_message(role_name="User", content=prompt)
print(Fore.YELLOW + f"User prompt:\n{prompt}\n")

# Get the response from the agent
response = agent.step(user_msg)
for msg in response.msgs:
    print_text_animated(Fore.GREEN + f"Agent response:\n{msg.content}\n")
