# Import necessary libraries for handling images and environment variables
import os  # For accessing environment variables
from email.mime import image  # Likely unused in this context

import dotenv  # For loading environment variables from a .env file

# Import modules from ComposioCrewAI and LangChain
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI

# Import embedtool from composio.tools.local
from composio.tools.local import embedtool


# Load environment variables from a .env file
dotenv.load_dotenv()

# Initialize a ChatOpenAI instance with GPT-4o model
llm = ChatOpenAI(model="gpt-4o")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

# Retrieve tools from Composio, specifically the EMBEDTOOL app
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

# Define an image search agent
image_search_agent = Agent(
    role='Image Search Agent',
    goal=(
        'Search and retrieve images based on specific queries.'
    ),
    verbose=True,  # Enable verbose output
    memory=True,  # Enable memory for the agent
    backstory=(
        "You are an image search expert, skilled in finding and retrieving relevant images from the web. "
        "Your keen eye for detail ensures that the images you find are accurate and high quality."
    ),
    tools=tools,  # Tools available for the agent to use (EMBEDTOOL)
    allow_delegation=True  # Allow the agent to delegate tasks if necessary
)

# Define the images path, collection name, and query string
collection_name = "animals2"#this collection is stored in the path ./animals
collection_path = "/path/to/the/chromadb/folder/in/your/working/directory"
images_path = "/path/to/the/images"
prompt = "horse"
create_task_description = (
    "Create a vector store of the images in the "+images_path
    "collection name:"+ collection_name
    "folder_path:"+collection_path
)
query_task_description = (
    "Query the vector store for prompt:"+prompt
    "with store name:"+collection_name
    "collection_path at:"+collection_path
)


# Define a task for the image search agent
image_search_task = Task(
    description=query_task_description,
    expected_output='A collection of retrieved images.',  # Expected result from the task
    agent=image_search_agent,  # Agent assigned to perform the task
    human_input=True  # Indicates that human input is allowed/required
)

# Execute the task and retrieve the result
result = image_search_task.execute()

# Print the result
print(result)
