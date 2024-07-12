# Import necessary libraries for handling images and environment variables
import os  # For accessing environment variables
from email.mime import image  # Likely unused in this context

import dotenv  # For loading environment variables from a .env file

# Import modules from ComposioCrewAI and LangChain
from composio_crewai import ComposioToolSet, App # type: ignore
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

# Define the images path and query string
images_path = "/path/to/the/images/folder"
search_prompt = "image_description"
top_no_of_images = 1 #returns n closest images to the search 


#Create a vector store prompt template
create_task_description = "Create a vector store of the images in the "+images_path

#Query the vector store prompt template
query_task_description = "Only Query the vector store for the top"+str(top_no_of_images)+",image of:"+search_prompt+"at the indexed directory:"+images_path

# Define a task for the image search agent
image_search_task = Task(
    description=query_task_description,
    expected_output='A collection of retrieved images.',  # Expected result from the task
    agent=image_search_agent,  # Agent assigned to perform the task
    #human_input=True  # Indicates that human input is allowed/required
)

# Execute the task and retrieve the result
result = image_search_task.execute()

# Print the result
print(result)
