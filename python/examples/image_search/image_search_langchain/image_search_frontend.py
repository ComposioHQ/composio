import os

import dotenv
import streamlit as st
from composio_langchain import App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI


# Load environment variables
dotenv.load_dotenv()

# Initialize ChatOpenAI and ComposioToolSet
llm = ChatOpenAI(model="gpt-4", openai_api_key=os.environ["OPENAI_API_KEY"])
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

# Retrieve tools from Composio
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

# Pull prompt from LangChain hub
prompt = hub.pull("hwchase17/openai-functions-agent")

# Create OpenAI functions agent and AgentExecutor
query_agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True)

# Streamlit UI
st.title("Image Query Application")

# Sidebar for configuration
st.sidebar.header("Configuration")
collection_name = st.sidebar.text_input("Collection Name", "animals2")
collection_path = st.sidebar.text_input(
    "Collection Path", "/path/to/the/chromadb/folder/in/your/working/directory"
)
images_path = st.sidebar.text_input("Images Path", "/path/to/the/images")

# Main content
st.header("Query Images")
user_prompt = st.text_input("Enter your query prompt:")

if st.button("Run Query"):
    if user_prompt:
        with st.spinner("Processing query..."):
            query_task = (
                f"Query the vector store for prompt: {user_prompt} "
                f"with store name: {collection_name} "
                f"collection_path at: {collection_path}"
            )

            # Execute the query task
            result = agent_executor.invoke({"input": query_task})

            # Display the result
            st.subheader("Query Result")
            st.write(result["output"])
    else:
        st.warning("Please enter a query prompt.")

# Option to create a new vector store
st.header("Create New Vector Store")
if st.button("Create Vector Store"):
    with st.spinner("Creating vector store..."):
        create_task = (
            f"Create a vector store of the images in the {images_path} "
            f"collection name: {collection_name} "
            f"folder_path: {collection_path}"
        )

        # Execute the create task
        result = agent_executor.invoke({"input": create_task})

        # Display the result
        st.subheader("Vector Store Creation Result")
        st.write(result["output"])

# Add some helpful information
st.sidebar.markdown("---")
st.sidebar.info(
    "This application allows you to query a vector store of images. "
    "You can also create a new vector store from a directory of images. "
    "Make sure to set the correct paths in the sidebar before querying or creating a vector store."
)
