import os
import dotenv
from textwrap import dedent
from composio_langchain import Action, App, ComposioToolSet, action
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
from composio.tools.local import ragtool

# Load environment variables from .env file
dotenv.load_dotenv()


# Initialize the ComposioToolSet
toolset = ComposioToolSet()

@action(toolname="PDFTOOL", requires=['langchain-community'])
def parse_pdf(file_path: str) -> str:
        """
        Walks the local file system and parses PDF files, returning their text content
        :param file_path: the local path of a pdf file to extract text from
        :return content: The text content in the pdf as a string
        """
        from langchain_community.document_loaders import PyPDFLoader
        loader = PyPDFLoader(file_path)
        content = ""
        for page in loader.lazy_load():
            content += page.page_content
            
        return content
    
# Get the RAG tool from the Composio ToolSet
tools = toolset.get_tools(
    # apps=[App.RAGTOOL, App.FILETOOL],
    actions=[Action.RAGTOOL_ADD_CONTENT_TO_RAG_TOOL, 
             Action.RAGTOOL_RAG_TOOL_QUERY,
             Action.FILETOOL_FIND_FILE,
             parse_pdf
             ]
    )


# Initialize the ChatOpenAI model with GPT-4 and API key from environment variables
llm = ChatOpenAI(model="gpt-4o")

user_query = ""

# Define the RAG Agent
rag_agent = Agent(
    role="RAG Agent",
    goal=dedent(
        """\
        Add relevant content to the kno knowledgebase using the RAG TOOL and parsePDF tool.
        Formulate a query to retrieve information from the RAG tool based on user input.
        After retrieval and addition of content, evaluate whether the goal given by the user input is achieved. If yes, stop execution."""
    ),
    verbose=True,
    memory=True,
    backstory=dedent(
        """\
        You are an expert in understanding user requirements, forming accurate queries,
        and enriching the knowledge base with relevant content."""
    ),
    llm=llm,
    allow_delegation=False,
    tools=tools,
)

# Define the task for adding content to the RAG tool


add_content_tasks = Task(
    description=dedent(
        f"""\
            Search the local file system for .txt and .pdf files. Then, add the content of those files to the knowledgebase with the RAG TOOL. Parse pdf files with the parsePDF tool."""
    ),
    expected_output="Content was added to the RAG tool",
    # pydantic validation error is not recognizing that the StructuredTool class, of which the RAG tool from the composio toolset is an instance, is an extension of the required BaseTool class
    # tools=tools,
    agent=rag_agent,
    # allow_delegation=False,
)
# Define the task for executing the RAG tool query
query_task = Task(
    description=dedent(
        f"""\
        Formulate a query based on this input: {user_query}.
        Retrieve relevant information using the RAG tool and return the results."""
    ),
    expected_output="Results of the RAG tool query were returned. Stop once the goal is achieved.",
    # pydantic validation error is not recognizing that the StructuredTool class, of which the RAG tool from the composio toolset is an instance, is an extension of the required BaseTool class
    # tools=[tools], 
    agent=rag_agent,
    allow_delegation=False,
)

# Define the crew with the agent and tasks
crew = Crew(
    agents=[rag_agent],
    tasks=[add_content_tasks, query_task],
    process=Process.sequential,
)

if __name__ == "__main__":
    while True:
        user_query = input("Type your prompt...")
        # Kickoff the process and print the result
        result = crew.kickoff()
        print(result)
