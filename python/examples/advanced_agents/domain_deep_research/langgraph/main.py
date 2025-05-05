from composio import ComposioToolSet
import os
from dotenv import load_dotenv
from langchain_together import ChatTogether
from langgraph.checkpoint.memory import MemorySaver
from typing import Annotated, TypedDict
=from typing_extensions import TypedDict
from composio_langgraph import Action, ComposioToolSet
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.runnables.config import RunnableConfig
import typing
load_dotenv()

class State(TypedDict):
    messages: Annotated[list, add_messages]

graph_builder = StateGraph(State)

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.COMPOSIO_SEARCH_TAVILY_SEARCH, Action.PERPLEXITYAI_PERPLEXITY_AI_SEARCH, Action.GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN])
llm = ChatTogether(model='Qwen/Qwen3-235B-A22B-fp8-tput')
llm_with_tools = llm.bind_tools(tools)
llm_for_questions = ChatTogether(model='Qwen/Qwen3-235B-A22B-fp8-tput')

def call_model(state):
    messages = state["messages"]
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

graph_builder.add_node("agent", call_model)

tool_node = ToolNode(tools=tools)
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "agent",
    tools_condition,
)
graph_builder.add_edge("tools", "agent")
graph_builder.add_edge(START, "agent")
memory = MemorySaver()

graph = graph_builder.compile(checkpointer=memory)

# Define config with required key for checkpointer, cast to RunnableConfig
config = typing.cast(RunnableConfig, {"configurable": {"thread_id": "1"}})

system_message = """
You are a sophisticated research assistant. Perform comprehensive research on the given query and provide detailed analysis. Focus on:
- Key concepts and main ideas
- Current developments and trends
- Important stakeholders and their roles
- Relevant data and statistics
- Critical analysis and implications

Create a detailed report on the research and write it in Google Docs.

Ensure all information is accurate, up-to-date, and properly sourced. Present findings in a clear, structured format suitable for professional analysis.
"""

print("\U0001F916: Hi! I can help you research any topic. Let's start!")
topic = input("What topic would you like to research? ")
domain = input("What domain is this topic in? ")

# Step 1: Generate research questions
questions_prompt = (
    f"Generate exactly 5 specific yes/no research questions about the topic '{topic}' in the domain '{domain}'. "
    f"Respond ONLY with the text of the 5 questions formatted as a numbered list, and NOTHING ELSE."
)
print("\n\U0001F916: Generating research questions...")
question_generation_messages = [{"role": "user", "content": questions_prompt}]
print("[DEBUG] Chat history for question generation:", question_generation_messages)
response = llm_for_questions.invoke(question_generation_messages)
questions_text = response.content or ""

def extract_questions_after_think(text):
    if "</think>" in text:
        return text.split("</think>", 1)[1].strip()
    return text.strip()

questions_only = extract_questions_after_think(questions_text)

print("\n\U0001F916: Here are 5 research questions:")
print(questions_only)

# Step 2: For each question, create a new graph and get the answer
questions_list = [q.strip() for q in questions_only.split('\n') if q.strip()]
question_answers = []

for idx, question in enumerate(questions_list):
    print(f"\n\U0001F916: Researching question {idx+1}: {question}")
    memory = MemorySaver()
    per_question_graph = graph_builder.compile(checkpointer=memory)
    per_question_config = typing.cast(RunnableConfig, {"configurable": {"thread_id": str(idx+2)}})
    question_prompt = (
        f"You are a sophisticated research assistant. Answer the following research question about the topic '{topic}' in the domain '{domain}':\n\n"
        f"{question}\n\n"
        f"Use the PERPLEXITYAI_PERPLEXITY_AI_SEARCH and COMPOSIO_SEARCH_SEARCH tools to provide a concise, well-sourced answer."
    )
    messages = [{"role": "user", "content": question_prompt}]
    answer = ""
    for chunk in per_question_graph.stream({"messages": messages}, config=per_question_config, stream_mode="values"):
        content = chunk["messages"][-1].content
        print(content)
        answer += content + "\n"
    question_answers.append({"question": question, "answer": answer})

# Step 3: Compile all answers and create Google Doc
final_memory = MemorySaver()
final_graph = graph_builder.compile(checkpointer=final_memory)
final_config = typing.cast(RunnableConfig, {"configurable": {"thread_id": "final"}})

qa_sections = "\n".join(
    f"<h2>{idx+1}. {qa['question']}</h2>\n<p>{qa['answer']}</p>" for idx, qa in enumerate(question_answers)
)

compile_report_prompt = (
    f"You are a sophisticated research assistant. Compile the following research findings into a professional, McKinsey-style report. The report should be structured as follows:\n\n"
    f"1. Executive Summary/Introduction: Briefly introduce the topic and domain, and summarize the key findings.\n"
    f"2. Research Analysis: For each research question, create a section with a clear heading and provide a detailed, analytical answer. Do NOT use a Q&A format; instead, weave the answer into a narrative and analytical style.\n"
    f"3. Conclusion/Implications: Summarize the overall insights and implications of the research.\n\n"
    f"Use clear, structured HTML for the report.\n\n"
    f"Topic: {topic}\nDomain: {domain}\n\n"
    f"Research Questions and Findings (for your reference):\n{qa_sections}\n\n"
    f"Use the GOOGLEDOC_CREATE_DOCUMENT tool to create a Google Doc with the report. The text should be in HTML format. You have to create the google document with all the compiled info. You have to do it."
)
compile_report_messages = [{"role": "user", "content": compile_report_prompt}]
print("\n\U0001F916: Compiling report and creating Google Doc...")
print("[DEBUG] Chat history for report compilation:", compile_report_messages)
for chunk in final_graph.stream({"messages": compile_report_messages}, config=final_config, stream_mode="values"):
    print(chunk["messages"][-1].content)

# Optional: Follow-up
follow_up = input("Anything else you want to ask: ")
follow_up_messages = [{"role": "user", "content": follow_up}]
events = final_graph.stream({"messages": follow_up_messages}, config=final_config, stream_mode="values")
for event in events:
    event["messages"][-1].pretty_print()