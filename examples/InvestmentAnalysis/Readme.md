# Investment Analyst Guide

## Introduction
This project demonstrates the use of the CrewAI framework and Composio Tools to automate the process of conducting investment research and generating investment recommendations. CrewAI orchestrates autonomous AI agents, enabling them to collaborate and execute complex tasks efficiently.
This guide provides detailed steps to create an Investment Analyst Agent that leverages CrewAI, Composio, and ChatGPT API to perform investment research, analyze stocks, and offer recommendations based on user input.

## 1. Install Required Packages

First, let’s install the necessary packages and connect your SERPAPI account using Composio CLI so agents can use it. Run the following commands on your terminal:

### Run Command

```bash
pip install composio-langchain
pip install composio-core
pip install langchain-community
pip install huggingface_hub
pip install google-search-results

# Connect your SERPAPI account so agents can use it.
composio add serpapi
```

## 2. Imports and Environment Setup

In your Python script, import the necessary libraries and set up your environment variables.

### Import Statements

```python
from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_openai import ChatOpenAI
import os
```

## 3. Initialize Tools and Agents

Initialize the tools and agents required for the system. Make sure to set the `SERPAPI_API_KEY` environment variable with your API key.

### Tools and LLMs

```python
os.environ["SERPAPI_API_KEY"] = os.getenv("SERPAPI_API_KEY")

# Initialize the language model
llm = ChatOpenAI(
    openai_api_key=os.environ["OPENAI_API_KEY"],
    model_name="gpt-4o"
)

# Define tools for the agents
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(actions=[Action.SERPAPI_SEARCH])
```

## 4. Defining the Agents

Define the roles and goals of our agents. There are three agents in use here: Investment Researcher, Investment Analyst, and Investment Recommender agents.

### Agents

```python
# Define the Investment Researcher agent
researcher = Agent(
    role='Investment Researcher',
    goal='Use SERP to research the top 2 results based on the input given to you and provide a report',
    backstory="""
    You are an expert Investment researcher. Using the information given to you, conduct comprehensive research using
    various sources and provide a detailed report. Don't pass in location as an argument to the tool
    """,
    verbose=True,
    allow_delegation=True,
    tools=tools,
    llm=llm
)

# Define the Investment Analyst agent
analyser = Agent(
    role='Investment Analyst',
    goal='Analyse the stock based on information available to it, use all the tools',
    backstory="""
    You are an expert Investment Analyst. You research on the given topic and analyse your research for insights.
    Note: Do not use SERP when you're writing the report
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

# Define the Investment Recommender agent
recommend = Agent(
    role='Investment Recommendation',
    goal='Based on the analyst insights, you offer recommendations',
    backstory="""
    You are an expert Investment Recommender. You understand the analyst insights and with your expertise suggest and offer
    advice on whether to invest or not. List the Pros and Cons as bullet points
    """,
    verbose=True,
    tools=tools,
    llm=llm
)
```

## 5. Defining the Task and Kickoff the Process

Create a task for the analyst agent and execute the process.

### Execute

```python
# Get user input for the research topic
user_input = input("Please provide a topic: ")

# Define the task for the analyst agent
analyst_task = Task(
    description=f'Research on {user_input}',
    agent=analyser,
    expected_output="When the input is well researched, thoroughly analysed and recommendation is offered"
)

# Create the crew with the defined agents and task
investment_crew = Crew(
    agents=[researcher, analyser, recommend],
    tasks=[analyst_task],
    verbose=1,
    full_output=True,
)

# Execute the process
res = investment_crew.kickoff()
```

## Putting it All Together

### Final Code

```python
from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_openai import ChatOpenAI
import os
import dotenv
# Environment Setup
os.environ["SERPAPI_API_KEY"] = os.getenv("SERPAPI_API_KEY")

# Initialize the language model
llm = ChatOpenAI(
    openai_api_key=os.environ["OPENAI_API_KEY"],
    model_name="gpt-4o"
)

# Define tools for the agents
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(actions=[Action.SERPAPI_SEARCH])

# Define the Investment Researcher agent
researcher = Agent(
    role='Investment Researcher',
    goal='Use SERP to research the top 2 results based on the input given to you and provide a report',
    backstory="""
    You are an expert Investment researcher. Using the information given to you, conduct comprehensive research using
    various sources and provide a detailed report. Don't pass in location as an argument to the tool
    """,
    verbose=True,
    allow_delegation=True,
    tools=tools,
    llm=llm
)

# Define the Investment Analyst agent
analyser = Agent(
    role='Investment Analyst',
    goal='Analyse the stock based on information available to it, use all the tools',
    backstory="""
    You are an expert Investment Analyst. You research on the given topic and analyse your research for insights.
    Note: Do not use SERP when you're writing the report
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

# Define the Investment Recommender agent
recommend = Agent(
    role='Investment Recommendation',
    goal='Based on the analyst insights, you offer recommendations',
    backstory="""
    You are an expert Investment Recommender. You understand the analyst insights and with your expertise suggest and offer
    advice on whether to invest or not. List the Pros and Cons as bullet points
""",
verbose=True,
tools=tools,
llm=llm
)

# Get user input for the research topic
user_input = input("Please provide a topic: ")

# Define the task for the analyst agent
analyst_task = Task(
    description=f'Research on {user_input}',
    agent=analyser,
    expected_output="When the input is well researched, thoroughly analysed and recommendation is offered"
)

# Create the crew with the defined agents and task
investment_crew = Crew(
    agents=[researcher, analyser, recommend],
    tasks=[analyst_task],
    verbose=1,
    full_output=True,
)

# Execute the process
res = investment_crew.kickoff()
```

This setup automates the workflow for investment research, analysis, and recommendation, leveraging AI tools and models for efficient and accurate results. Customize the agents' roles, tools, and goals as needed for specific use cases.
