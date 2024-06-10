# Research Assistant Guide

This guide provides detailed steps to create a research assistant agent that leverages CrewAI, Composio, and ChatGPT to perform web searches and compile research reports.

## 1. Install Required Packages

You need to connect your SerpAPI account using the Composio CLI. This allows agents to use SerpAPI for web searches. Run the following commands on your terminal:

```bash
pip install composio-langchain composio-core langchain-community huggingface_hub google-search-results dotenv

# Connect your SerpAPI account so agents can use it.
composio add serpapi
```

## 2. Importing Required Libraries

Now, import the necessary libraries in your Python script:

```python
import os
from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_openai import ChatOpenAI
```

## 3. Initialize Tools and LLM

Initialize the tools and LLM required for your research assistant:

```python

dotenv.load_dotenv()
# Initialize the language model
llm = ChatOpenAI(
    openai_api_key=os.environ["OPENAI_API_KEY"],
    model_name="gpt-4o"
)

# Composio tool for SerpAPI
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(actions=[Action.SERPAPI_SEARCH])
```

Make sure to set the `OPENAI_API_KEY` environment variable with your Google API key.

## 4. Defining the Agent

Define the Researcher agent with the necessary parameters:

```python
researcher = Agent(
    role='Researcher',
    goal='Search the internet for the information requested',
    backstory="""
    You are a researcher. Using the information in the task, you find out some of the most popular facts about the topic along with some of the trending aspects.
    You provide a lot of information thereby allowing a choice in the content selected for the final blog.
    """,
    verbose=True,
    allow_delegation=False,
    tools=tools,
    llm=llm
)
```

## 5. Defining the Task

Create and execute a task for the agent:

```python
task1 = Task(
    description="""Research about open source LLMs vs closed source LLMs. Your final answer MUST be a full analysis report""",  # To change the topic, edit the text after 'Research about' in the description parameter of task1
    expected_output='When the research report is ready',
    agent=researcher
)
task1.execute()
```

## Putting It All Together

Below is the complete code snippet combining all the steps:

```python
# Import required libraries
from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_openai import ChatOpenAI
import os
import dotenv
# Initialize tools and agents
llm = ChatOpenAI(
    openai_api_key=os.environ["OPENAI_API_KEY"],
    model_name="gpt-4o"
)

# Composio tool for SerpAPI
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(actions=[Action.SERPAPI_SEARCH])

# Define the Agent
researcher = Agent(
    role='Researcher',
    goal='Search the internet for the information requested',
    backstory="""
    You are a researcher. Using the information in the task, you find out some of the most popular facts about the topic along with some of the trending aspects.
    You provide a lot of information thereby allowing a choice in the content selected for the final blog.
    """,
    verbose=True,
    allow_delegation=False,
    tools=tools,
    llm=llm
)

# Define the Task
task1 = Task(
    description="""Research about open source LLMs vs closed source LLMs. Your final answer MUST be a full analysis report""",
    expected_output='When the research report is ready',
    agent=researcher
)

# Execute the Task
task1.execute()
```
```
