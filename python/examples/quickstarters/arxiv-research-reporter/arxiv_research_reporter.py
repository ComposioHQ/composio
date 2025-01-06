"""
ArXiv Research Reporter Example

This script demonstrates the use of LlamaIndex and Composio tools to:
1. Research a specific topic on ArXiv
2. Create GitHub issues based on the research findings
3. Organize and present the findings in a structured format

The script uses OpenAI's GPT-4o model for processing and analysis.

Required Dependencies:
- composio-llamaindex: For Composio tool integration
- llama-index: Core LlamaIndex functionality
- llama-index-tools-arxiv: For ArXiv research capabilities (separate package)
- python-dotenv: For environment variable management
- openai: For GPT-4o model access

Environment Variables Required:
- OPENAI_API_KEY: Your OpenAI API key
- COMPOSIO_API_KEY: Your Composio API key

Note: If you encounter import errors, ensure all required packages are installed:
    pip install -r requirements.txt
"""

import sys
import dotenv
from composio_llamaindex import Action, ComposioToolSet  # pylint: disable=import-error
from llama_index.agent.openai import OpenAIAgent
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

try:
    from test_imports import ArxivToolSpec  # Using our custom implementation
except ImportError:
    print("Error: Custom ArxivToolSpec not found. Please ensure test_imports.py is in the same directory.")
    sys.exit(1)


# Load environment variables from .env
dotenv.load_dotenv()

llm = OpenAI(model="gpt-4o")

# Configuration constants
RESEARCH_TOPIC = "LLM agents function calling"
TARGET_REPO = "composiohq/composio"
N_ISSUES = 3


def main():
    """
    Main function that orchestrates the research and issue creation process.

    This function:
    1. Initializes the Composio toolset for GitHub integration
    2. Sets up the ArXiv research tool
    3. Configures and runs an OpenAI agent to perform research and create issues
    4. Processes and displays the results
    """
    # Get All the tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_actions(actions=[Action.GITHUB_CREATE_AN_ISSUE])
    arxiv_tool = ArxivToolSpec()

    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                "You are now an integration agent, and whatever you are "
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
        f"Please research on Arxiv about `{RESEARCH_TOPIC}`, Organize "
        f"the top {N_ISSUES} results as {N_ISSUES} issues for "
        f"a github repository, finally raise those issues with proper, "
        f"title, body, implementation guidance and reference in "
        f"{TARGET_REPO} repo, as well as relevant tags and assignee as "
        "the repo owner."
    )

    print("Response:", response)


if __name__ == "__main__":
    main()
