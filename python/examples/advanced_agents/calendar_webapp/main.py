import streamlit as st
from dotenv import load_dotenv
from composio_openai import ComposioToolSet, App
from openai import OpenAI

load_dotenv()

def initialize_ai():
    openai_client = OpenAI()
    composio_toolset = ComposioToolSet(entity_id="default")

    return openai_client, composio_toolset

def execute_calendar_task(task, openai_client, composio_toolset):
    tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        tools=tools,
        messages=[
            {"role": "system", "content": "You are a helpful google calendar assistant."},
            {"role": "user", "content": task},
        ],
    )

    result = composio_toolset.handle_tool_calls(response)
    print(result)

def main():
    st.set_page_config(page_title="AI Calendar App", page_icon="💼", layout="wide")

    st.title("AI Calendar App")
    openai_client, composio_toolset = initialize_ai()

    with st.form("handle_request"):
        task = st.text_input("Task")
        submit_button = st.form_submit_button("Run")

    if submit_button:
        if not task:
            st.error("Please fill in all required fields")
            return
        
        with st.spinner("Analyzing your request..."):
            execute_calendar_task(task, openai_client, composio_toolset)
            st.success("Executed task!")


if __name__ == "__main__":
    main()
