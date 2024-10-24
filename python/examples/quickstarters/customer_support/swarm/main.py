import gradio as gr
from swarm import Agent, Swarm
from composio import ComposioToolSet, Action
from dotenv import load_dotenv

load_dotenv()

toolset = ComposioToolSet()

def google_sheet_action(values):
    """Adds values to the google sheet
    Args:
        values: Input values ot be added in the spreadsheet 
    """
    spreadsheet_id="1yTa_5uaX7_fRKiejpw6FitLTV04uGJHUUMV5v18Quoo"
    sheet_name="Sheet1"
    res = toolset.execute_action(
        action=Action.GOOGLESHEETS_BATCH_UPDATE,
        params={},
        text=f"this is the spreadsheet id:{spreadsheet_id}, values to add {values}, in sheet {sheet_name} ",
        entity_id="default",
    )
    return res

def search(query):
    """
    Searches the internet 
    """
    res = toolset.execute_action(
        action=Action.EXA_SEARCH,
        params={
            "query":query
        },
        entity_id="default"
    )
    return res

def scrape(webpage_link):
    """
    scrapes the content of the webpage based on the link
    """
    res = toolset.execute_action(
        action=Action.WEBTOOL_SCRAPE_WEBSITE_CONTENT,
        params={},
        text=webpage_link,
        entity_id="default"
    )
    return res

def add_rag(data):
    """
    add content to vector store
    """
    res = toolset.execute_action(
        action=Action.RAGTOOL_ADD_CONTENT_TO_RAG_TOOL,
        params={
            'content':data
        },
        text="content to add"+data,
        entity_id="default"
    )

def query_rag(query):
    """
    query RAG 
    """
    res = toolset.execute_action(
        action=Action.RAGTOOL_RAG_TOOL_QUERY,
        params={},
        text=query,
        entity_id="default"
    )

def linear_issue(issue_title, issue_description):
    projects_id = toolset.execute_action(
        Action.LINEAR_LIST_LINEAR_PROJECTS,
        params={},
        entity_id='default'
    )

    team_id = toolset.execute_action(
        Action.LINEAR_LIST_LINEAR_TEAMS,
        params={},
        text="find project id here:"+str(projects_id),
    )
    res = toolset.execute_action(
        action=Action.LINEAR_CREATE_LINEAR_ISSUE,
        params={
        },
        text=f"issue_title:{issue_title}, issue_description:{issue_description}, project_id:{str(projects_id)}, teams id:{str(team_id)}"
    )

client = Swarm()

agent_a = Agent(
    name="Researcher",
    instructions="""
    EXECUTE ALL TOOL CALLS, You answer queries based on internet searches. First search each link then scrape the content and add it in RAG
    You query the RAG Vector Store first if the answer is satisfactory
    you create tickets in google spreadsheet, in the format of columns [queries] [solutions] and [resolved?] 
    Also create a linear issue if it is not resolved
    Return the final answer to the question
    """,
    functions=[search, add_rag, query_rag, google_sheet_action, linear_issue],
)

def process_query(query):
    response = client.run(
        agent=agent_a,
        messages=[{"role": "user", "content": query + "This is query from a user, answer it and ensure it is logged in the google sheet"}],
        execute_tools=True,
    )
    return response.messages[-1]["content"]

# Create Gradio interface
iface = gr.Interface(
    fn=process_query,
    inputs=gr.Textbox(lines=2, placeholder="Enter your query here..."),
    outputs="text",
    title="Swarm Agent Query Interface",
    description="Enter your query and get responses from the Swarm Agent. The agent will search the internet, use RAG, and log the query in a Google Sheet.",
)

# Launch the interface
iface.launch()