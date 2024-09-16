from typing import Literal, Annotated, Sequence, TypedDict
import operator
import re
from datetime import datetime
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from composio_langgraph import Action, ComposioToolSet
from composio.client.collections import TriggerEventData

# Setup
load_dotenv()

# Constants
SCHEDULER_AGENT_NAME = "Scheduler"
TOOL_NODE_NAME = "ToolNode"
DATE_TIME = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# Initialize LLM and tools
llm = ChatOpenAI(model="gpt-4-turbo")
composio_toolset = ComposioToolSet()

schedule_tools = composio_toolset.get_actions(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
    ]
)
email_tools = composio_toolset.get_actions(actions=[Action.GMAIL_CREATE_EMAIL_DRAFT])
tools = [*schedule_tools, *email_tools]

tool_node = ToolNode(tools)

# Define AgentState
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    sender: str

# Helper functions
def create_agent_node(agent, name):
    def agent_node(state):
        result = agent.invoke(state)
        if not isinstance(result, ToolMessage):
            result = AIMessage(**result.dict(exclude={"type", "name"}), name=name)
        return {"messages": [result], "sender": name}
    return agent_node

def create_agent(system_prompt, tools):
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)

# System prompt
scheduler_system_prompt = f"""
You are an AI assistant specialized in analyzing emails, creating calendar events, and drafting response emails. Your primary tasks are:

1. Analyze email content:
   a. Understand the email received from the sender. 
   b. Determine if an event should be created based on the email content.
   c. Extract relevant information such as proposed meeting times, topics, and participants.

2. Manage calendar events:
   a. If an event should be created, use the Google Calendar Find Free Slots action to identify available time slots.
   b. Once a suitable slot is found, use the Google Calendar Create Event action to schedule the event.
   c. Ensure to invite the email sender and any other relevant participants to the event.

3. Draft response emails:
   a. If an event was created, draft a confirmation email for the sender.
   b. The email should include:
      - A clear subject line (e.g., "Meeting Scheduled")
      - A brief description of the scheduled meeting's purpose
      - The date, time, and duration of the event
      - Any other relevant details or instructions for the participants

Remember:
- The current date and time is {DATE_TIME}.
- All conversations and scheduling occur in the IST timezone.
- Be courteous and professional in all communications.
- If you encounter any errors when making function calls, try passing an empty config ({{"config": {{}}}}).
- Always provide a FINAL ANSWER when you've completed all necessary tasks.

Your goal is to efficiently manage scheduling and communication, ensuring a smooth experience for all parties involved.
"""

scheduler_agent = create_agent(scheduler_system_prompt, tools)
scheduler_node = create_agent_node(scheduler_agent, SCHEDULER_AGENT_NAME)

# Router function
def router(state) -> Literal["call_tool", "__end__", "continue"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "call_tool"
    if "FINAL ANSWER" in last_message.content:
        return "__end__"
    return "continue"

# Create workflow
workflow = StateGraph(AgentState)

workflow.add_node(SCHEDULER_AGENT_NAME, scheduler_node)
workflow.add_node(TOOL_NODE_NAME, tool_node)

workflow.add_edge(START, SCHEDULER_AGENT_NAME)
workflow.add_edge(SCHEDULER_AGENT_NAME, END)

workflow.add_conditional_edges(
    TOOL_NODE_NAME,
    lambda x: x["sender"],
    {SCHEDULER_AGENT_NAME: SCHEDULER_AGENT_NAME},
)

workflow.add_conditional_edges(
    SCHEDULER_AGENT_NAME,
    router,
    {
        "continue": SCHEDULER_AGENT_NAME,
        "call_tool": TOOL_NODE_NAME,
    },
)

app = workflow.compile()

def extract_sender_email(payload):
    if not any(header.get("name") == "Delivered-To" and header.get("value") for header in payload["headers"]):
        return None

    for header in payload["headers"]:
        if header["name"] == "From":
            match = re.search(r"[\w\.-]+@[\w\.-]+", header["value"])
            return match.group(0) if match else None
    return None

def process_email(email_sender, email_content, thread_id):
    final_state = app.invoke({
        "messages": [
            HumanMessage(content=f"""                              
Please process the email 
Email sender: {email_sender} 
Email content: {email_content}
Thread id: {thread_id}
""")
        ]
    })
    return final_state["messages"][-1].content

listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def callback_new_message(event: TriggerEventData) -> None:
    payload = event.payload
    thread_id = payload.get("threadId")
    email_content = payload.get("snippet")
    email_sender = extract_sender_email(payload["payload"])

    if email_sender is None:
        print("No sender email found")
        return

    print(f"Processing email from: {email_sender}")
    output = process_email(email_sender, email_content, thread_id)
    print("Final output:", output)

listener.listen()