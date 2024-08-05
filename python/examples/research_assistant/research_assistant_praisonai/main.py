import os
import yaml
import dotenv
from praisonai import PraisonAI
from composio_praisonai import Action, ComposioToolSet,App
from langchain_openai import ChatOpenAI
# Load environment variables
dotenv.load_dotenv()

# Initialize the language model with OpenAI API key and model name
llm = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    model="gpt-4"
)

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(actions=[Action.SERPAPI_SEARCH])

tool_section_str = composio_toolset.get_tools_section(tools)
print(tool_section_str)


# Define the agent YAML configuration
agent_yaml = """
framework: "crewai"
topic: "Research"

roles:
  researcher:
    role: "Researcher"
    goal: "Search the internet for the information requested"
    backstory: "A researcher tasked with finding and analyzing information on various topics using available tools."
    tasks:
      research_task:
        description: "Research about open source LLMs vs closed source LLMs."
        expected_output: "A full analysis report on the topic."
""" + tool_section_str

print(agent_yaml)

# Create a PraisonAI instance with the agent_yaml content
praison_ai = PraisonAI(agent_yaml=agent_yaml)

# Run PraisonAI
result = praison_ai.main()

# Print the result
print(result)
