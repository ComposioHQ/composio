import streamlit as st
import os
import dotenv
from composio_langchain import ComposioToolSet, App
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from composio.tools.local import embedtool

# Load environment variables
dotenv.load_dotenv()


# Streamlit app
def main():
    st.title("Image Search App")

    # Sidebar for API key input
    # Main app
    images_path = st.text_input("Enter the path to the images folder:")
    search_prompt = st.text_input(
        "Enter the image description for the image you want to search:"
    )
    top_no_of_images = st.number_input(
        "Number of closest images to return:", min_value=1, value=5
    )

    if st.button("Search Images"):
        if not images_path or not search_prompt:
            st.error("Please fill in all the required fields.")
        else:
            with st.spinner("Searching images..."):
                results = search_images(images_path, search_prompt, top_no_of_images)
            st.success("Search completed!")
            st.write(results)


def search_images(images_path, search_prompt, top_no_of_images):
    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o")

    # Get prompt from LangChain hub
    prompt = hub.pull("hwchase17/openai-functions-agent")

    # Initialize ComposioToolSet
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

    task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't create a vector store.
    If it already exists, query the vector store
    Search the vector store for {search_prompt}
    The images path and indexed directory is {images_path}
    return the top {top_no_of_images} results.
    """

    # Create agent and executor
    query_agent = create_openai_functions_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True)

    # Execute the query task and get the result
    res = agent_executor.invoke({"input": task_description})
    return res


if __name__ == "__main__":
    main()
