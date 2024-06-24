from email.mime import image
import os
import dotenv
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
from composio.local_tools import embedtool

llm = ChatOpenAI(model="gpt-4o")
composio_toolset = ComposioToolSet(api_key = os.environ["COMPOSIO_API_KEY"])
tools = composio_toolset.get_tools(apps= [App.EMBEDTOOL])

image_search_agent = Agent(
    role='Image Search Agent',
    goal=(
        'Search and retrieve images based on specific queries.'
    ),
    verbose=True,
    memory=True,
    backstory=(
        "You are an image search expert, skilled in finding and retrieving relevant images from the web. "
        "Your keen eye for detail ensures that the images you find are accurate and high quality."
    ),
    tools=tools,  # SerperDevTool configured for image search
    allow_delegation=True
)

images_path = "./images/"
collection_name = "animals"
query_string = "horse"

image_search_task = Task(
    description=(
        "Create a vector store with name:"+collection_name
        "Using images in the path:"+images_path
        "and query the word:"+query_string
    ),
    expected_output='A collection of retrieved images.',
    agent=image_search_agent,
    human_input=True
)

result = image_search_task.execute()
print(result)