# Import necessary libraries for handling images and environment variables
import os  # For accessing environment variables
from email.mime import image  # Likely unused in this context

import dotenv  # For loading environment variables from a .env file

# Import modules from ComposioCrewAI and LangChain
from composio_crewai import ComposioToolSet, App  # type: ignore
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI

# Import embedtool from composio.tools.local
from composio.tools.local import embedtool
from composio.tools.local import filetool


# Load environment variables from a .env file
dotenv.load_dotenv()

# Initialize a ChatOpenAI instance with GPT-4o model
llm = ChatOpenAI(model="gpt-4o")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet()

# Retrieve tools from Composio, specifically the EMBEDTOOL app
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

# Define an image search agent
image_search_agent = Agent(
    role="Image Search Agent",
    goal=("Search and retrieve images based on specific queries."),
    verbose=True,  # Enable verbose output
    memory=True,  # Enable memory for the agent
    backstory=(
        "You are an image search expert, skilled in finding and retrieving relevant images from the web. "
        "Your keen eye for detail ensures that the images you find are accurate and high quality."
    ),
    tools=tools,  # Tools available for the agent to use (EMBEDTOOL)
    allow_delegation=True,  # Allow the agent to delegate tasks if necessary
)

images_path = input("Enter the path to the images folder:")
search_prompt = input("Enter the image description for the image you want to search:")
top_no_of_images = int(
    input(
        "What number of images that are closest to the description that should be returned:"
    )
)  # returns n closest images to the search

task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't create a vector store.
    If it already exists, query the vector store
    The images path and indexed directory is {images_path}
    the prompt for the image to search is {search_prompt}
    return the top {top_no_of_images} results.

"""
# Define a task for the image search agent
image_search_task = Task(
    description=task_description,
    expected_output="A collection of retrieved images.",  # Expected result from the task
    agent=image_search_agent,  # Agent assigned to perform the task
    # human_input=True  # Indicates that human input is allowed/required
)

crew = Crew(agents=[image_search_agent], tasks=[image_search_task])
# Execute the task and retrieve the result
result = crew.kickoff()

# Print the result
print(result)
