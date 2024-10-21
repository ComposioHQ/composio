# Research Agent

### This guide provides detailed steps to create a Demo Assistant using Composio and OpenAI. You will build a system capable of interacting with GitHub to create issues and fetch user information.

#### This project is an example that uses Composio to seamlessly interact with GitHub through an AI assistant. It automatically creates issues and retrieves user information based on user input.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/tree/master/python/examples/quickstarters/arxiv-research-reporter">Research Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the Demo Assistant project. This repository contains all the necessary files and scripts to set up and run the Demo Assistant using Composio and OpenAI.</p>
</div>



+ ## 1. Import base packages
  Next, we’ll import the essential libraries for our project.
  ### Import statements
  ```python
  import os
  import dotenv
  from composio_llamaindex import Action, ComposioToolSet  # pylint: disable=import-error
  from llama_index.core.llms import ChatMessage  # pylint: disable=import-error
  from llama_index.llms.openai import OpenAI  # pylint: disable=import-error
  from llama_index.agent.openai import OpenAIAgent
  from llama_index.tools.arxiv.base import ArxivToolSpec
  ```


+ ## 2. Initialize LLM
  We’ll initialize our LLM and set up the necessary configurations.
  ### Python - Initialize LLM
  ```python
  dotenv.load_dotenv()

  llm = OpenAI(model="gpt-4o")

  research_topic = "LLM agents function calling"
  target_repo = "composiohq/composio"
  n_issues = 3
  ```



+ ## 3. Define Main Function
  Define the main function for Python that will handle incoming requests and interact with the OpenAI API.
  ### Define Main
  ```python
  def main():
    # Get All the tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_actions(actions=[Action.GITHUB_CREATE_AN_ISSUE])
    arxiv_tool = ArxivToolSpec()

    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                "You are now a integration agent, and whatever you are "
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
  ```



+ ## 4. Start the Server
  Finally, we’ll Run the main on Python to execute the Agent
  ### Main function
  ```python 
  if __name__ == "__main__":
    main()        
  ```




# Putting it All Together
### Python Final Code
```python
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
```