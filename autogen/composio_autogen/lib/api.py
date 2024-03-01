import json
import os
import time
import webbrowser
import requests
import jinja2
from beaupy.spinners import Spinner, BARS
from .storage import get_user_id

COMPOSIO_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZWFjOWU1Yi00MTM5LTRjNTQtYjMzOS1kYWQ1NTk2YTU2OWUiLCJlbWFpbCI6ImhpbWFuc2h1QGNvbXBvc2lvLmRldiIsImlhdCI6MTcwOTI4NTg2NywiZXhwIjoxNzExODc3ODY3fQ.5wvDvGRQSTpxtlVpCfDT0uD1yD6pMFg4YHM-hvNDMJ8'
BASE_URL = "https://hermes-production-6901.up.railway.app/api"

SKILLS_FILE = os.path.join(os.path.dirname(__file__), 'skills.json')

def get_url_for_composio_action(toolName: str, actionName: str):
    return f"{BASE_URL}/{toolName}/{actionName}"

def identify_user(identifer: str):
    response = requests.post(f"{BASE_URL}/user/create/${identifer}", headers={
        'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN
    })
    if response.status_code == 200:
        user_id = response.json().get('userId')
        return user_id
    raise Exception("Failed to identify user")

def get_redirect_url_for_integration(integrationName: str, scopes = []):
    user_id = get_user_id()
    response = requests.post(f"{BASE_URL}/user/auth", headers={
        'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
        'X_ENDUSER_ID': user_id
    }, json={
        'endUserID': user_id,
        'provider': {
            'name': integrationName,
            'scope': scopes
        }
    })

    if response.status_code == 200:
        return list([response.json().get('providerAuthURL'), response.json().get('connectionReqId')])

    print(response.text)
    raise Exception("Failed to get auth URL for integration")

def wait_for_tool_auth_completion(connReqID: str, toolName: str):
    user_id = get_user_id()
    if user_id is None:
        print("Error: No authenticated user found. Please authenticate first.")
        return

    while True:  # Loop forever
        status_check_url = f"{BASE_URL}/auth/{connReqID}/status"
        status_payload = json.dumps({})
        status_headers = {
            'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
            'Content-Type': 'application/json',
        }
        response = requests.request("GET", status_check_url, headers=status_headers, data=status_payload)
        status_data = response.json()
        status = status_data.get('status')
        if status == 'PENDING' or status == 'STARTED':
            time.sleep(1)  # Wait for 5 seconds before retrying
        else:
            break
    
    return True

def get_skills_file_template():
    path = os.path.join(os.path.dirname(__file__), 'templates/skills.txt')
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))
    return env.get_template('templates/skills.txt')

def list_tools():
    # @TODO: Dummy API call response, replace with actual API call after it is ready
    user_id = get_user_id()
    if user_id is None:
        raise Exception("No authenticated user found. Please authenticate first.")
    
    url = f"{BASE_URL}/all_tools"
    headers = {
      'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
      'X_ENDUSER_ID': user_id
    }
    response = requests.post(url, headers=headers, json={
        "skip": 0,
        "limit": 1000,
        "actions": True,
        "triggers": False
    })
    if response.status_code == 200:
        tools_data = response.json()
        return tools_data
    else:
       raise Exception("Failed to fetch tools.")