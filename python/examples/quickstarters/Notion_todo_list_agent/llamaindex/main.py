import gradio as gr
import os
import dotenv
import datetime
from llama_index.llms.openai import OpenAI
from llama_index.core.llms import ChatMessage
from llama_index.core.agent import FunctionCallingAgentWorker
from composio_llamaindex import Action, ComposioToolSet, App


def initialize_agent(api_key):
    dotenv.load_dotenv()
    
    llm = OpenAI(model="gpt-4")
    
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_tools(apps=[App.SLACK], entity_id='default')
    
    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                "You are AI agent that acts like a personal assistant. "
                "You have access to the entire Slack of the user. "
                "Read the messages of the previous day and create a list of todos on Notion. "
                "The page name should be the current date"
            ),
        )
    ]
    
    agent = FunctionCallingAgentWorker(
        tools=tools,
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    ).as_agent()
    
    return agent, composio_toolset

def generate_todo_list(api_key, notion_parent_id):
    try:
        # Initialize agent and toolset
        agent, composio_toolset = initialize_agent(api_key)
        current_date = datetime.datetime.now()
        
        # Generate todo list from Slack
        response = agent.chat(f"""Create the todo list for today.
                                Today's Date is {current_date}.
                                So see yesterday's conversations.
                                First list all the conversation channels and direct message chats with users
                                then check for each channel the history of conversation
                                Return the to do list as the output""")
        
        # Create Notion page
        page_id = composio_toolset.execute_action(
            action=Action.NOTION_CREATE_NOTION_PAGE,
            params={
                "parent_id": notion_parent_id,
                "title": str(current_date)
            }
        )
        
        # Add content to Notion page
        final = composio_toolset.execute_action(
            action=Action.NOTION_ADD_PAGE_CONTENT,
            params={
                "parent_block_id": page_id['data']['data']['id'],
                "content_block": {
                    'content': response.response
                }
            }
        )
        
        return f"""
        Todo list generated successfully!
        
        Generated Content:
        {response.response}
        
        Notion Page Created:
        Date: {current_date}
        Page ID: {page_id['data']['data']['id']}
        """
    except Exception as e:
        return f"Error occurred: {str(e)}"

# Create Gradio interface
with gr.Blocks(title="Slack-to-Notion Todo Generator") as demo:
    gr.Markdown("""
    # Slack-to-Notion Todo List Generator
    
    This tool automatically generates a todo list from your Slack conversations and saves it to Notion.
    """)
    
    with gr.Row():
        with gr.Column():
            api_key_input = gr.Textbox(
                label="Composio API Key",
                placeholder="Enter your Composio API key",
                type="password"
            )
            notion_parent_id = gr.Textbox(
                label="Notion Parent Page ID",
                placeholder="Enter the Notion parent page ID",
                value='Add your notion page id here'
            )
            generate_button = gr.Button("Generate Todo List", variant="primary")
        
    output_text = gr.Textbox(
        label="Output",
        placeholder="Results will appear here...",
        lines=10,
    )
    
    generate_button.click(
        fn=generate_todo_list,
        inputs=[api_key_input, notion_parent_id],
        outputs=output_text
    )
    
    gr.Markdown("""
    ### Instructions:
    1. Enter your Composio API key
    2. Optionally modify the Notion parent page ID
    3. Click "Generate Todo List" to create a new todo list from yesterday's Slack conversations
    
    The tool will:
    - Scan yesterday's Slack conversations
    - Generate a todo list
    - Create a new Notion page with today's date
    - Add the todo list to the Notion page
    """)

# Launch the app
if __name__ == "__main__":
    demo.launch()