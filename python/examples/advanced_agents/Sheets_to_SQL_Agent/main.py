import time
import logging
from google.oauth2 import service_account
from googleapiclient.discovery import build
from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action

# Set up logging configuration
logging.basicConfig(filename='sheet_monitor.log', level=logging.INFO, format='%(asctime)s:%(levelname)s:%(message)s')

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

    openai_client = OpenAI()
    composio_toolset = ComposioToolSet()
    actions = composio_toolset.get_tools(apps=[App.SQLTOOL])

    assistant_instruction = """You are a super intelligent SQL assistant. When given a description of changes made to a Google Sheet, write appropriate SQL queries to implement those changes in the 'company' database. Each change should be a separate SQL query.
     If this is the initial sync, create TABLES with the sheet names first, and then INSERT statements for all rows. Use the tool at your disposal"
    Connection string will always be company.db. If this is not the initial sync then use the sheet names as the Table names always.
    """
    my_task = "\n".join(changes)

    assistant = openai_client.beta.assistants.create(
        name="SQL Assistant",
        instructions=assistant_instruction,
        model="gpt-4o",
        tools=actions,
    )

    thread = openai_client.beta.threads.create()
    message = openai_client.beta.threads.messages.create(
        thread_id=thread.id,
        role="user",
        content=my_task
    )

    run = openai_client.beta.threads.runs.create(
        thread_id=thread.id,
        assistant_id=assistant.id
    )

    response_after_tool_calls = composio_toolset.wait_and_handle_assistant_tool_calls(
        client=openai_client,
        run=run,
        thread=thread,
    )

    logging.info('Database changes executed.')
    logging.info(response_after_tool_calls)
    print('Database changes executed:')
    print(response_after_tool_calls)
    return response_after_tool_calls


def create_spreadsheet(service, title):
    spreadsheet = {
        'properties': {
            'title': title
        }
    }
    spreadsheet = service.spreadsheets().create(body=spreadsheet, fields='spreadsheetId').execute()
    logging.info(f"Created spreadsheet with ID: {spreadsheet.get('spreadsheetId')}")
    return spreadsheet.get('spreadsheetId')

def read_values(service, spreadsheet_id, range_name):
    result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    values = result.get('values', [])
    logging.info(f"Read values from {range_name}: {values}")
    return values

def update_values(service, spreadsheet_id, range_name, values):
    body = {
        'values': values
    }
    result = service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id, range=range_name,
        valueInputOption='USER_ENTERED', body=body).execute()
    logging.info(f"Updated {result.get('updatedCells')} cells")

def add_values(service, spreadsheet_id, range_name, values):
    body = {
        'values': values
    }
    result = service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id, range=range_name,
        valueInputOption='USER_ENTERED', body=body).execute()
    logging.info(f"Added {result.get('updates').get('updatedRows')} rows")


def perform_user_operation(service, spreadsheet_id):
    operation = input("What operation do you want to perform? (create/read/update/add): ").lower()

    if operation == 'create':
        title = input("Enter the title for the new spreadsheet: ")
        new_spreadsheet_id = create_spreadsheet(service, title)
        print(f"New spreadsheet created with ID: {new_spreadsheet_id}")
    elif operation == 'read':
        range_name = input("Enter the range to read (e.g., Sheet1!A1:B10): ")
        values = read_values(service, spreadsheet_id, range_name)
        print(f"Values read: {values}")
    elif operation == 'update':
        range_name = input("Enter the range to update (e.g., Sheet1!A1:B2): ")
        values = eval(input("Enter the values as a list of lists (e.g., [['A1', 'B1'], ['A2', 'B2']]): "))
        update_values(service, spreadsheet_id, range_name, values)
    elif operation == 'add':
        range_name = input("Enter the range to append to (e.g., Sheet1!A:B): ")
        values = eval(input("Enter the values as a list of lists (e.g., [['New A1', 'New B1'], ['New A2', 'New B2']]): "))
        add_values(service, spreadsheet_id, range_name, values)
    else:
        print("Invalid operation. Please choose create, read, update, or add.")


def monitor_all_sheets(spreadsheet_id, interval=10):
    logging.info(f'Starting to monitor spreadsheet: {spreadsheet_id}')
    credentials = service_account.Credentials.from_service_account_file(
        "key.json",
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
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

    logging.info("Initial sync complete.")
    print("Initial sync complete.")

    while True:
        continue_monitoring = input("Do you want to perform manual operations? (Yes/No): ").lower()

        if continue_monitoring == 'yes':
            while True:
                perform_user_operation(service, spreadsheet_id)
                continue_operations = input("Do you want to perform another operation? (Yes/No): ").lower()
                if continue_operations != 'yes':
                    break

        logging.info("Monitoring for changes...")
        print("Monitoring for changes...")

        monitoring_start_time = time.time()

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

            # Check if it's time to ask about manual operations again
            if time.time() - monitoring_start_time >= 300:  # 5 minutes
                break

# Usage
spreadsheet_id = "1i8OwCM_o2E4tmpZ18-2Jgu8G42ntPWoUgGhfbcyxnoo"
polling_interval = 10  # seconds

monitor_all_sheets(spreadsheet_id, polling_interval)