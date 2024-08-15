import os
import dotenv
from composio_llamaindex import Action, ComposioToolSet  # pylint: disable=import-error
from llama_index.core.llms import ChatMessage  # pylint: disable=import-error
from llama_index.llms.openai import OpenAI  # pylint: disable=import-error
from llama_index.agent.openai import OpenAIAgent
from llama_index.tools.arxiv.base import ArxivToolSpec

# Load environment variables from .env
dotenv.load_dotenv()

llm = OpenAI(model="gpt-4o")

research_topic = "LLM agents function calling"
target_repo = "composiohq/composio"
n_issues = 3


def main():
    # Get All the tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_actions(actions=[Action.GITHUB_CREATE_AN_ISSUE])
    arxiv_tool = ArxivToolSpec()

    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                "You are now a integration agent, and what  ever you are "
                "requested, you will try to execute utilizing your tools."
            ),
        )
    ]

    agent = OpenAIAgent.from_tools(
        tools=tools + arxiv_tool.to_tool_list(),
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    )

    response = agent.chat(
        f"Please research on Arxiv about `{research_topic}`, Organize "
        f"the top {n_issues} results as {n_issues} issues for "
        f"a github repository, finally raise those issues with proper, "
        f"title, body, implementation guidance and reference in "
        f"{target_repo} repo,  as well as relevant tags and assignee as "
        "the repo owner."
    )

    print("Response:", response)


if __name__ == "__main__":
    main()
