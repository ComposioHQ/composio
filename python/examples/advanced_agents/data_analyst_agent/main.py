import os
import time
import logging
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build # type: ignore
from openai import OpenAI # type: ignore
from composio_langchain import ComposioToolSet, App, Action
from langchain_cerebras import ChatCerebras # type: ignore
from langgraph.prebuilt import create_react_agent # type: ignore
from langchain.agents import AgentExecutor
from langchain import hub

llm = ChatCerebras(
    model="llama3.1-70b",
    api_key=os.environ["CEREBRAS_API_KEY"]
)

# Set up logging configuration
logging.basicConfig(filename='sheet_monitor.log', level=logging.INFO, format='%(asctime)s:%(levelname)s:%(message)s')
load_dotenv()

def get_all_sheets(spreadsheet_id, credentials):
    logging.info(f'Fetching all sheets for spreadsheet: {spreadsheet_id}')
    service = build("sheets", "v4", credentials=credentials)
    sheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = sheet_metadata.get('sheets', '')
    logging.info(f'Found sheets: {sheets}')
    return sheets

def get_sheet_data(service, spreadsheet_id, sheet_name):
    logging.info(f'Getting data for sheet: {sheet_name}')
    range_name = f"{sheet_name}!A:Z"  # Adjust the range as needed
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id, range=range_name).execute()
    logging.info(f'Data retrieved for sheet {sheet_name}: {result.get("values", [])}')
    return result.get('values', [])

def compare_data(previous, current):
    logging.info('Comparing previous and current data...')
    changes = []

    # Check for deletions and updates
    for i, row in enumerate(previous):
        if i >= len(current):
            changes.append(f"Row {i+1} was deleted: {row}")
            logging.info(f"Row {i+1} was deleted")
        elif row != current[i]:
            changes.append(f"Row {i+1} was updated from {row} to {current[i]}")
            logging.info(f"Row {i+1} was updated from {row} to {current[i]}")

    # Check for additions
    for i in range(len(previous), len(current)):
        changes.append(f"Row {i+1} was added: {current[i]}")
        logging.info(f"Row {i+1} was added: {current[i]}")

    return changes

def execute_openai_composio(changes):
    logging.info('Executing changes on company database...')


    composio_toolset = ComposioToolSet()
    actions = composio_toolset.get_tools(apps=[App.SQLTOOL])

    assistant_instruction = """You are a super intelligent SQL assistant. When given a description of changes made to a Google Sheet, write appropriate SQL queries to implement those changes in the 'company' database. Each change should be a separate SQL query.
     If this is the initial sync, create TABLES with the sheet names first, and then INSERT statements for all rows. Use the tool at your disposal"
    Connection string will always be company.db. If this is not the initial sync then use the sheet names as the Table names always.
    """
    prompt = assistant_instruction
    my_task = "\n".join(changes)

    agent = create_react_agent(llm, actions, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=actions, verbose=True)

    # Execute using agent_executor
    response_after_tool_calls = agent_executor.invoke({"input": my_task})

    logging.info('Database changes executed.')
    logging.info(response_after_tool_calls)
    print('Database changes executed:')
    print(response_after_tool_calls)
    return response_after_tool_calls

def monitor_all_sheets(spreadsheet_id, interval=10):
    logging.info(f'Starting to monitor spreadsheet: {spreadsheet_id}')
    credentials = service_account.Credentials.from_service_account_file(
        "python/examples/advanced_agents/data_analyst_agent/key.json",
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    service = build("sheets", "v4", credentials=credentials)

    all_sheets = get_all_sheets(spreadsheet_id, credentials)
    previous_data = {}

    logging.info("Initial data load and sync...")
    print("Initial data load and sync...")
    initial_changes = []

    for sheet in all_sheets:
        sheet_name = sheet['properties']['title']
        sheet_data = get_sheet_data(service, spreadsheet_id, sheet_name)
        previous_data[sheet_name] = sheet_data
        initial_changes.extend([f"Initial data for sheet '{sheet_name}':"] + [f"Row {i+1} added: {row}" for i, row in enumerate(sheet_data)])

    # Execute OpenAI and Composio code for initial sync
    execute_openai_composio(initial_changes)

    logging.info("Initial sync complete. Monitoring for changes...")
    print("Initial sync complete. Monitoring for changes...")

    while True:
        time.sleep(interval)
        changes_detected = False
        all_changes = []

        for sheet in all_sheets:
            sheet_name = sheet['properties']['title']
            current_data = get_sheet_data(service, spreadsheet_id, sheet_name)

            if current_data != previous_data[sheet_name]:
                changes = compare_data(previous_data[sheet_name], current_data)
                if changes:
                    logging.info(f"Changes detected in sheet: {sheet_name}")
                    print(f"\nChanges detected in sheet: {sheet_name}")
                    for change in changes:
                        logging.info(change)
                        print(change)
                    all_changes.extend(changes)
                    changes_detected = True
                previous_data[sheet_name] = current_data

        if changes_detected:
            response = execute_openai_composio(all_changes)
            logging.info(f"Tool call output: {response}")
        else:
            logging.info("No changes detected in any sheet.")
            print("No changes detected in any sheet.")

# Usage
spreadsheet_id = "1i8OwCM_o2E4tmpZ18-2Jgu8G42ntPWoUgGhfbcyxnoo"
polling_interval = 60  # seconds

monitor_all_sheets(spreadsheet_id, polling_interval)