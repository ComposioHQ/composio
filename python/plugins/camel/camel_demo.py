# pylint: disable=E0611
from camel.agents import ChatAgent
from camel.configs import ChatGPTConfig
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType
from camel.utils import print_text_animated
from colorama import Fore
from composio_camel import Action, ComposioToolSet


# pylint: enable=E0611


composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)

# set up LLM model
assistant_model_config = ChatGPTConfig(
    temperature=0.0,
    tools=tools,
)

model = ModelFactory.create(
    model_platform=ModelPlatformType.OPENAI,
    model_type=ModelType.GPT_3_5_TURBO,
    model_config_dict=assistant_model_config.__dict__,
)


# set up agent
assistant_sys_msg = BaseMessage.make_assistant_message(
    role_name="Developer",
    content=(
        "You are a programmer as well an experienced github user. "
        "When asked given a instruction, "
        "you try to use available tools, and execute it"
    ),
)

agent = ChatAgent(
    assistant_sys_msg,
    model,
    tools=tools,
)
agent.reset()


# set up agent
PROMPT = (
    "I have created a new Github Repo,"
    "Please star my github repository: camel-ai/camel"
)
user_msg = BaseMessage.make_user_message(role_name="User", content=PROMPT)
print(Fore.YELLOW + f"user prompt:\n{PROMPT}\n")

response = agent.step(user_msg)
for msg in response.msgs:
    print_text_animated(Fore.GREEN + f"Agent response:\n{msg.content}\n")
