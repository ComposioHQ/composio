import json
import os
import time
import requests


COMPOSIO_TOKEN = 'ghp_1J2g3h4i5j6k7l8m9n0o33'
BASE_URL = "https://hermes-production-6901.up.railway.app/api"

ACCESS_TOKEN = "COMPOSIO-X3125-ZUA-1"
SKILLS_FILE = os.path.join(os.path.dirname(__file__), 'skills.json')

def get_url_for_composio_action(toolName: str, actionName: str):
    return f"{BASE_URL}/tools/{toolName}/actions/{actionName}"

def identify_user(identifer: str):
    response = requests.post(f"{BASE_URL}/user/create/${identifer}", headers={
        'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN
    })
    if response.status_code == 200:
        user_id = response.json().get('userId')
        return user_id
    raise Exception("Failed to identify user")

def get_user_id():
    if os.path.exists('user_data.json'):
        with open('user_data.json', 'r') as infile:
            user_data = json.load(infile)
            return user_data.get('user_id')
    return None

def get_redirect_url_for_integration(integrationName: str, scopes = []):
    user_id = get_user_id()
    response = requests.get(f"{BASE_URL}/user/auth", headers={
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
        return response.json().get('providerAuthURL') 

    print(response.text)
    raise Exception("Failed to get auth URL for integration")

def wait_for_tool_auth_completion(toolName: str):
    user_id = get_user_id()
    start_time = time.time()
    while time.time() - start_time < 40:
        response = requests.get(f"{BASE_URL}/user/providerid/{toolName}/credentials", headers={
            'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
            'X_ENDUSER_ID': user_id
        })
        if response.status_code == 200 and response.json().get('is_authenticated') == True:
            return True
        time.sleep(5)
    raise Exception("Authentication timeout or failed to get auth status for tool")

def list_tools():
    # @TODO: Dummy API call response, replace with actual API call after it is ready
    hardcoded_tools_response_path = os.path.join(os.path.dirname(__file__), 'hardcoded_tools.json');
    with open(hardcoded_tools_response_path, 'r') as infile:
        user_data = json.load(infile)
        return user_data

    user_id = get_user_id()
    if user_id is None:
        raise Exception("No authenticated user found. Please authenticate first.")
    
    url = f"{BASE_URL}/tools"
    headers = {
      'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
      'X_ENDUSER_ID': user_id
    }
    response = requests.get(url, headers=headers)
    print(response.text)
    if response.status_code == 200:
        tools_data = response.json()
        return tools_data
    else:
       raise Exception("Failed to fetch tools.")