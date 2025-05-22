import dotenv
from textwrap import dedent
from composio_langchain import App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
import logging
import time

# Set logging level to suppress warnings
logging.basicConfig(level=logging.ERROR)

# Load environment variables from .env file
dotenv.load_dotenv()

# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Initialize the ChatOpenAI model
llm = ChatOpenAI(model="gpt-4.1-nano")

# Path to the document or folder you want to process
document_path = input("Enter the path to your document or folder: ")

# Variable to store collection ID
collection_id = None

# Get the DocumentRagTool from Composio
try:
    tools = toolset.get_tools(apps=[App.DOCUMENTRAGTOOL])
        
except Exception as e:
    print(f"Error loading DocumentRagTool: {e}")

# Define the Document RAG Agent
doc_rag_agent = Agent(
    role="Document RAG Agent",
    goal=dedent(
        """\
        Process uploaded documents to build a knowledge base.
        Answer questions based on the content of the uploaded documents.
        """
    ),
    verbose=False,
    memory=True,
    backstory=dedent(
        """\
        You are an expert in document analysis and information retrieval.
        You can process various document types and answer questions based on their content.
        """
    ),
    llm=llm,
    tools=tools,
    allow_delegation=False,
)

# Define the task for uploading the document
upload_task = Task(
    description=dedent(
        f"""\
        Upload and process the document or folder at: {document_path}
        Use the UploadDocument tool with this exact file path to process this document.
        """
    ),
    expected_output="Document was successfully processed and added to the knowledge base",
    agent=doc_rag_agent,
    tools=tools,
    allow_delegation=False,
)

# Run the upload task first
print("Uploading document...")
upload_crew = Crew(
    agents=[doc_rag_agent],
    tasks=[upload_task],
    process=Process.sequential,
)
upload_result = upload_crew.kickoff()
print(f"Upload complete: {upload_result.raw if hasattr(upload_result, 'raw') else str(upload_result)}")

try:

    result_text = upload_result.raw if hasattr(upload_result, 'raw') else str(upload_result)
    if "Collection ID:" in result_text:
        collection_id = result_text.split("Collection ID:")[1].split()[0].strip().rstrip(',.')
    print(f"Collection ID: {collection_id}")
except Exception as e:
    print(f"Warning: Unable to extract collection ID automatically: {e}")
    collection_id = input("Please enter the collection ID from the response: ")

# Check if we have a collection ID before proceeding
if not collection_id:
    print("Error: Failed to get a valid collection ID. Please check if the document upload was successful.")
    exit(1)

# Function to determine if a query is complex
def is_complex_query(query):

    complex_indicators = [
        "compare", "contrast", "difference", "summarize", "analyze", 
        "evaluate", "interpret", "synthesize", "why", "how would", 
        "what if", "explain", "relation", "relationship", "implications"
    ]
    

    if any(indicator in query.lower() for indicator in complex_indicators):
        return True
    
    if len(query.split()) > 10:
        return True
        
    return False

print("\n*** Document processed. You can now ask questions. Type 'exit' to quit. ***")
print("*** Simple queries will be processed directly for speed, complex queries will use the agent ***\n")

while True:
    user_query = input("\nAsk a question about your documents: ")
    if user_query.lower() in ['exit', 'quit', 'q']:
        break
    
    # Create a query task with the collection ID included in the description
    query_task = Task(
        description=dedent(
            f"""\
            Based on the uploaded documents, answer this question: {user_query}
            Use the QueryDocument tool to search in collection with ID: {collection_id}
            Make sure to include the collection_id parameter when using the QueryDocument tool.
            """
        ),
        expected_output="Answer to the query based on document content.",
        agent=doc_rag_agent,
        tools=tools,
        allow_delegation=False,
    )
    
    # Run the query
    start_time = time.time()
    query_crew = Crew(
        agents=[doc_rag_agent],
        tasks=[query_task],
        process=Process.sequential,
    )
    result = query_crew.kickoff()
    end_time = time.time()
    
    print(f"\nQuery completed in {end_time - start_time:.2f} seconds")
    print("\nAnswer:", result.raw if hasattr(result, 'raw') else str(result))