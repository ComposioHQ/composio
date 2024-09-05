# README: Composio Agents Overview

This repository contains several Python scripts that utilize the Composio framework to create intelligent agents for various tasks. Each agent is designed to perform specific functions, leveraging the capabilities of the ComposioToolSet. Below is an overview of each agent and its purpose.

## Agents Overview

### 1. Research Assistant
**File:** `python/examples/quick_starters/research_assistant.py`

The Research Assistant agent is designed to search the internet for information on a specified topic. It utilizes the ComposioToolSet to access tools like SERPAPI, enabling it to gather relevant data and provide a comprehensive analysis report on topics such as "open source LLMs vs closed source LLMs." The agent is initialized with a language model (GPT-4o) to enhance its understanding and response generation.

### 2. Pull Request Summary Agent
**File:** `python/examples/quick_starters/pr_summary_agent.py`

This agent focuses on summarizing GitHub pull requests. It fetches pull requests from a specified repository and analyzes them to provide detailed summaries, including code changes and relevant details. The agent uses the ComposioToolSet to interact with GitHub and the LangChain model for generating summaries. It is particularly useful for developers looking to quickly understand changes in codebases.

### 3. Newsletter Summarizer
**File:** `python/examples/quick_starters/newsletter_summarizer.py`

The Newsletter Summarizer agent fetches recent newsletter emails from a user's inbox, summarizes their content, and sends a well-formatted email with the summarized information. It uses Gmail tools from the ComposioToolSet to access emails and the ChatGroq model for summarization. This agent is ideal for users who want to stay updated on various topics without reading through multiple emails.

### 4. Code Index Agent
**File:** `python/examples/quick_starters/code_index_agent.py`

This agent analyzes a codebase by creating an index of the repository and answering user queries about the code. It uses the ComposioToolSet to perform code analysis and the GPT-4o model to provide insightful answers. This is particularly useful for developers who need to understand large codebases quickly.

### 5. Calendar Agent
**File:** `python/examples/quick_starters/calendar_agent.py`

The Calendar Agent manages scheduling tasks in Google Calendar. It takes user-defined time slots and books them according to specified tasks. The agent uses the ComposioToolSet to interact with Google Calendar APIs, making it easy for users to organize their schedules efficiently.

### 6. Code Execution Agent
**File:** `python/examples/quick_starters/code_execution_agent/main.py`

This agent executes Python code in a sandbox environment and returns the results. It utilizes the ComposioToolSet to access a code interpreter and is designed for users who want to run code snippets and see the output without setting up a local environment.

## How Composio Helps

Composio provides a powerful framework that simplifies the integration of various tools and APIs, allowing developers to create intelligent agents with minimal effort. The ComposioToolSet enables agents to access external services (like GitHub, Gmail, and Google Calendar) seamlessly. 

By leveraging Composio, developers can focus on building the logic and functionality of their agents without worrying about the underlying complexities of API interactions and data processing.

Composio supports all major agentic frameworks including Langchain, CrewAI, LlamaIndex, PhiData, Autogen, Langgraph, PraisonAI, CamelAI and many more
## Getting Started

To use these agents, ensure you have the necessary environment variables set up (e.g., API keys for OpenAI, GitHub, and Gmail). Each script can be run independently, and you can modify the parameters as needed to fit your specific use case.

### Prerequisites
- Python 3.x
- Required libraries (install via `pip install -r requirements.txt`)

### Running an Agent
1. Clone the repository.
2. Set up your environment variables.
3. Run the desired agent script using Python.
