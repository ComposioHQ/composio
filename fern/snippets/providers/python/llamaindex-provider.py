import asyncio
import dotenv
from composio_llamaindex import LlamaIndexProvider
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

from composio import Composio

# Load environment variables from .env
dotenv.load_dotenv()

# Setup client
llm = OpenAI(model="gpt-5")
composio = Composio(provider=LlamaIndexProvider())

tools = composio.tools.get(
    user_id="user@acme.com",
    tools=["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
)

workflow = FunctionAgent(
    tools=tools,
    llm=llm,
    system_prompt="You are an agent that performs github actions.",
)


async def main():
    result = await workflow.run(
        user_msg="Hello! I would like to star a repo composiohq/composio on GitHub"
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())