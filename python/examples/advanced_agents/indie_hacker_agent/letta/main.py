import dotenv
from composio_langchain import Action, ComposioToolSet
from letta import create_client, LLMConfig
from letta.schemas.tool import Tool

# Load environment variables from .env
# Set your OpenAI API Key in a .env file
dotenv.load_dotenv()


toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[
Action.CODEINTERPRETER_EXECUTE_CODE,
Action.CODEINTERPRETER_GET_FILE_CMD,
Action.CODEINTERPRETER_RUN_TERMINAL_CMD,
Action.HACKERNEWS_GET_TODAYS_POSTS,
Action.HACKERNEWS_GET_FRONTPAGE,
Action.HACKERNEWS_GET_LATEST_POSTS,
Action.HACKERNEWS_GET_ITEM_WITH_ID,
])
task = (
"""You are an Indie Hacker Agent, you are supposed to research hackernews.
Find a latest post to implement, brainstorm creative ideas and implement an MVP Version of it. 
The idea implementation should then be executed and shown to the user.
 Also print the link to the original idea on hackernews. Please execute the code on the code interpreter."""
)

client = create_client() 

agent_state = client.create_agent(
    name="Indie Hacker Agent", 
)

client.add_tool(tools)

response = client.send_message(agent_id=agent_state.id, role="user", message=task)
print("Usage:", response.usage)
print("Agent messages:", response.messages)
