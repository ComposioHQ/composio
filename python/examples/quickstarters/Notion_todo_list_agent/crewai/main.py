import gradio as gr
import os
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet, Action, App
from datetime import datetime
from dotenv import load_dotenv

def initialize_crew(api_key):
    load_dotenv()
    composio_toolset = ComposioToolSet(api_key=api_key)
    tools = composio_toolset.get_tools(apps=[App.SLACK])
    
    crewai_agent = Agent(
        role="To Do List Agent",
        goal="""You are an AI agent that is responsible for creating todo list based on slack conversation history of the previous day.
        Check all my Slack DMs always.""",
        backstory=(
            "You are AI agent that acts like a personal assistant"
            "You have access to the entire Slack of the user."
            "Read all the messages of the previous day and create a list of todos on Notion"
            "Even if it is some trivial message turn it into a todo"
            "The page name should be the current date"
        ),
        verbose=True,
        tools=tools,
        llm=ChatOpenAI(model='gpt-4-turbo'),
    )
    
    return crewai_agent, composio_toolset

def generate_todo_list(api_key, notion_parent_id, openai_api_key):
    try:
        # Set OpenAI API key
        import os
        os.environ['OPENAI_API_KEY'] = openai_api_key
        
        # Initialize agent and toolset
        crewai_agent, composio_toolset = initialize_crew(api_key)
        current_date = datetime.now()
        
        # Create and execute task
        task = Task(
            description=f"Create the todo list for today. Today's Date is {current_date}. So see yesterday's messages.",
            agent=crewai_agent,
            expected_output="a to do list was created in notion page"
        )
        
        my_crew = Crew(
            agents=[crewai_agent],
            tasks=[task]
        )
        
        # Generate todo list
        result = my_crew.kickoff()
        
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
                    'content': str(result)
                }
            }
        )
        
        return f"""
        Todo list generated successfully!
        
        Generated Content:
        {result.raw}
        
        Notion Page Created:
        Date: {current_date}
        Page ID: {page_id['data']['data']['id']}
        """
    except Exception as e:
        return f"Error occurred: {str(e)}"

# Create Gradio interface
with gr.Blocks(title="CrewAI Slack-to-Notion Todo Generator") as demo:
    gr.Markdown("""
    # CrewAI Slack-to-Notion Todo List Generator
    
    This tool uses CrewAI to automatically generate a todo list from your Slack conversations and saves it to Notion.
    """)
    
    with gr.Row():
        with gr.Column():
            api_key_input = gr.Textbox(
                label="Composio API Key",
                placeholder="Enter your Composio API key",
                type="password"
            )
            openai_key_input = gr.Textbox(
                label="OpenAI API Key",
                placeholder="Enter your OpenAI API key",
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
        inputs=[api_key_input, notion_parent_id, openai_key_input],
        outputs=output_text
    )
    
    gr.Markdown("""
    ### Instructions:
    1. Enter your Composio API key
    2. Enter your OpenAI API key
    3. Optionally modify the Notion parent page ID
    4. Click "Generate Todo List" to create a new todo list from yesterday's Slack conversations
    
    The tool will:
    - Use CrewAI to analyze yesterday's Slack conversations
    - Generate a comprehensive todo list
    - Create a new Notion page with today's date
    - Add the todo list to the Notion page
    
    Note: The agent will check all Slack DMs and convert even trivial messages into todos for comprehensive tracking.
    """)

# Launch the app
if __name__ == "__main__":
    demo.launch()